# Three.js 预览性能问题交接记录

日期：2026-06-27

范围：这是一份给后续前端性能工作的 handoff note，记录这次体检过程中发现的两个较大的剩余问题。它不是详细实现方案，也不要求后续 agent 按这里的顺序机械执行。

## 简短结论

这次已经修掉了一批低风险问题：相机缩放仍留在 Three.js 侧，atom 高亮不再让大量空闲对象每帧白跑，导出尺寸也不再无条件扫描整个场景。

但还有两个更大的性能问题，之后值得继续看：

1. 主 3D 预览仍然有点像“一直播放的视频”，即使画面静止，也可能持续准备新帧。
2. atoms 和 bonds 目前整体上仍然像“很多很多独立的小物体”，大结构时对象数量会变成压力。

这两个问题对小结构不一定明显。真正会出问题的场景，是几千个 atom、很多 bond、或者用户频繁拖动/缩放/检查 atom 的时候。

## 背景

Pretty Lattice 的前端现在大致分两层：

- React 负责应用界面、面板、按钮、输入框、状态协调。
- React Three Fiber / Three.js 负责真正的 3D 预览。

已经接受的边界原则写在 [Keep Camera Interaction in Three.js](../decisions/keep-camera-interaction-in-threejs.md)：高频相机交互应该尽量留在 Three.js 侧。React 可以显示相机状态、发命令、展示快照，但不应该成为每一次滚轮、拖拽、相机微小变化都必须经过的路径。

下面两个问题也是同一类思路：不要因为应用存在就一直做工作；只有画面真的变了才重画。也不要让 React/Three 一个一个管理成千上万个相似物体，如果 GPU 本来可以更批量地处理它们。

## 问题一：主预览仍然偏“常驻帧循环”

目前主 3D 预览里有不少地方依赖每帧回调：

- 相机控制器需要更新 controls，并兜底同步 zoom 快照；
- 跟随相机的灯光需要根据相机位置更新；
- orientation tracker 会读取当前相机方向；
- orientation gizmo 会跟着当前相机方向转；
- 相机动画、atom 高亮这类短动画在播放时也需要逐帧更新。

这种做法的好处是可靠。只要画布一直在刷新，拖动、缩放、灯光、小动画都不容易漏掉更新。

代价是：当画面什么都没变的时候，它也可能继续消耗 CPU/GPU。小结构下这通常无感；但大结构下，这种“空转”就会变成没有视觉收益的后台开销。

### 这里的几个词

- **Canvas**：React Three Fiber 里的 3D 画布，可以理解成晶体预览窗口。
- **Frame**：一帧，也就是 3D 画面重画一次。
- **Frame loop**：帧循环，决定画布是不是每个动画帧都要重画。
- **`useFrame`**：React Three Fiber 的每帧回调。相机动画、灯光跟随、高亮动画常会用它。
- **Demand frame loop**：按需帧循环。不是一直画，而是有东西请求时才画。
- **`invalidate`**：按需模式下的“请重画一帧”信号。

### 后续方向

后续可以考虑把主预览探索成 demand rendering：相机动了、控件改了、动画播放中、场景或样式变化了，就请求重画；画面静止时尽量安静。

这个方向的风险是“漏掉重画请求”。如果切到按需刷新，但某条路径忘了 `invalidate`，用户看到的可能是：

- 拖了鼠标，但画面没有动；
- 灯光方向没有跟上相机；
- 右上角方向小组件滞后；
- 相机动画或高亮动画停在半路。

所以它不太适合作为纯代码清理来做。后续 agent 应该先重新盘点当前所有 `useFrame` 使用点，再决定谁负责请求重画，并且最好做一次实际浏览器里的交互验证。

## 问题二：atoms 和 bonds 仍然是大量独立对象

当前结构渲染的思路很直观：一个 atom 可以对应一个 mesh，一个 bond 也可以对应一个 mesh。这样做的优点是容易理解，也方便挂点击、双击、选中、高亮、检查 atom 等行为。

但它的规模上限比较清楚：如果一个结构里有几千个 atom 和很多 bond，React 和 Three.js 都要管理很多独立对象。最近的修复已经减少了一些无关重渲染，但底层“对象很多”这个事实还在。

这不是说当前方案错了。当前方案很适合早期功能，也让交互行为容易做对。只是如果 Pretty Lattice 以后要更顺畅地处理很大的结构，就可能需要换一种更批量的渲染方式。

### 这里的几个词

- **Mesh**：Three.js 里的一个可见物体。通常由形状和材质组成。
- **Geometry**：形状数据，比如球、圆柱、三角面。
- **Material**：材质，比如颜色、透明度、是否受光照影响。
- **Draw call**：CPU 告诉 GPU “画这个东西”的一次命令。数量太多会拖慢。
- **Instancing**：实例化渲染。用同一个基础形状，一次性画出很多个副本。
- **Instanced mesh**：Three.js 里代表“很多个同类物体”的对象。每个副本可以有自己的位置、旋转、缩放，有时也可以有自己的颜色。
- **Picking / raycasting**：鼠标点到 3D 画面时，判断点中了哪个 atom 或 bond。

### 后续方向

长期方向可以先探索 atom instancing，再看 bond 是否也值得做。

直观地说，很多 atom 都是球。与其创建几千个独立球，不如保留一个球的形状，让 GPU 在不同位置、不同大小、不同颜色上画很多次。

不过这不是简单替换。因为 Pretty Lattice 里 atom 不是纯装饰物：用户可以点击 atom、双击检查 atom、让 atom 脉冲高亮、保持一个 atom 选中，也会看到周期性 image atom。instancing 可以支持这些事情，但 picking 和 highlight 需要从“点中了哪个 React 元素”改成“点中了哪个 instance id”。

所以这更像一个以后支持大结构时的架构级优化，不像普通小补丁。

## 后续接手时先重新检查

代码会继续变化，所以后续 agent 不应该只照着这篇 note 做。开始前建议重新看这些文件：

- `docs/decisions/keep-camera-interaction-in-threejs.md`
- `web/src/scene/LatticeScene.tsx`
- `web/src/scene/PreviewCameraController.tsx`
- `web/src/scene/StructureSceneObjects.tsx`
- `web/src/scene/OrientationGizmo.tsx`
- `web/src/scene/CameraHeadlight.tsx`

这篇 note 记录的是问题形状，不保证文件里的具体代码仍然和 2026-06-27 完全一样。

## 最重要的提醒

无论做 demand rendering 还是 instancing，都不要把高频相机交互重新搬回 React state。之前 zoom 卡顿的核心教训就是：滚轮和拖拽这种高频路径，不能让 React 大树成为必经之路。

对 demand rendering 来说，主要风险是漏重画。

对 instancing 来说，主要风险是丢掉 per-atom 行为，比如点击、检查、选中和高亮。

这两个方向都值得做，但都应该当成交互性能工作来验证，而不是只当成文件搬家或代码整理。

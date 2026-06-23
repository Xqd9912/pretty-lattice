# 3D视角调控与操作

**User:** Anonymous  
**Created:** 6/22/2026 10:16:02  
**Updated:** 6/22/2026 13:55:32  
**Exported:** 6/23/2026 20:04:33  
**Link:** [https://chatgpt.com/g/g-p-6a375ccb358c81919a6c68164d494952/c/6a389ae1-8c1c-83e8-8e17-d3595df4d3ef](https://chatgpt.com/g/g-p-6a375ccb358c81919a6c68164d494952/c/6a389ae1-8c1c-83e8-8e17-d3595df4d3ef)  

## Prompt:
2026/6/22 10:16:00

其实现在我在考虑怎么去，调控这个视角。
就比如说VESTA的这个，就是其实我不太懂这里边的逻辑，或者就说有没有一些大家常见的这个做法，就是你怎么去拖动一个3D物体调整视角？然后好像感觉这个，比如在vesta里边，就是你拖来拖去就一个鼠标拖来拖去。然后其实我也就是有就大概有一个，就是你知道人有个感觉它会怎么动，但是又说不上来严格的是怎么动的。

能不能给我解释一下？比如说比较常见的这种3D interactive的这种鼠标操作是怎么做的？什么逻辑？然后我们能不能想一想有什么？就是因为我们现在是做晶体嘛，对吧？有没有什么适合更可控的这个方式呀？就是一个是Interactive的，对吧？比如说也许像有两个转盘这种？然后包括我们这里是晶体对吧？它有这个lattice vector，不是一个任意的3D物体。有没有更适合晶体的这种的一个方式？

另一个就是说可能可以通过一个某种滑块，可以和interactive的操作绑定。我想应该是有两个自由度，但我不太确定这两个自由度怎么设计比较好。对，包括有没有一些这个大家的这个common practice，best practice，就是都需要请你调研一下。对，就是like，我对这个问题本身其实也没有很清楚，就是我希望你大概理解我所想知道的这个事情的范围，然后对，就也不用这个，就是只限制于我问的这些事情，因为其实我也不知道我要问什么事情。

## Response:
2026/6/22 10:16:03

我先把问题拆成三层：VESTA 这类拖动旋转的数学逻辑、通用 3D 交互范式，以及面向晶体/晶格向量的更可控视角方案。

这里有个关键区分：两个自由度只能决定“看向哪里”，完整姿态还需要绕视线的滚转；所以精确晶体取向应由投影方向加屏幕上方方向共同定义。

[![14. Arcball control - Speaker Deck](https://tse3.mm.bing.net/th/id/OIP.o0ZAa07DUJerP5LI0FqHeQHaFj?r=0&pid=Api)](https://speakerdeck.com/tatsy/14-arcball-control?utm_source=chatgpt.com)

你卡住的核心，其实是把三个不同的“自由度”混在了一起：

- **物体完整姿态**有 3 个自由度。
- **视线方向**只有 2 个自由度。
- **鼠标瞬时位移**也只有 2 个自由度。

所以你的“应该是两个自由度”的感觉并没有错：鼠标每一瞬间确实只输入两个数 $(\Delta x,\Delta y)$。但一个晶体的完整朝向属于 $SO(3)$，需要 3 个参数。更准确地说：

$$
\text{完整视角}
=
\underbrace{\text{视线方向}}_{2\ \mathrm{DOF}}
+
\underbrace{\text{绕视线旋转}}_{1\ \mathrm{DOF}}
$$

最后这个自由度通常叫 **roll**，也就是“屏幕里的图像顺时针或逆时针转一下”。Arcball 原论文就是从“姿态有三个独立方向，而鼠标只有两个方向”这个矛盾出发的。([Graphics Interface](https://graphicsinterface.org/wp-content/uploads/gi1992-18.pdf))

## 1. VESTA 里鼠标拖动大概是什么逻辑

VESTA 官方手册给出的描述是：

> 在 Free rotation 模式中，旋转轴垂直于鼠标移动的方向。

它没有公开具体映射公式，因此不能确认 VESTA 用的是严格的 Shoemake Arcball；但把这句话数学化，最自然的实现是：

$$
\Delta\mathbf s
=
\Delta x\,\mathbf e_x+\Delta y\,\mathbf e_y ,
$$

$$
\boldsymbol{\omega}
\propto
\mathbf e_z\times\Delta\mathbf s
=
-\Delta y\,\mathbf e_x+\Delta x\,\mathbf e_y .
$$

这里 $\mathbf e_x,\mathbf e_y$ 是屏幕横、纵方向，$\mathbf e_z$ 是屏幕法向。旋转角通常取

$$
\Delta\theta=k\sqrt{\Delta x^2+\Delta y^2}.
$$

直觉上：

- 鼠标向右拖，物体主要绕屏幕竖直轴转。
- 鼠标向上拖，物体主要绕屏幕水平轴转。
- 斜着拖，绕屏幕平面中垂直于拖动方向的轴转。

可以把它想象成：**晶体被装在一个透明球里，你用手掌推球的表面**。推的方向和球的瞬时转轴互相垂直。VESTA 还允许把旋转限制在 $x/y/z$ 轴，并且松开鼠标后立即停止。([jp-minerals.org](https://jp-minerals.org/vesta/en/doc/VESTAch11.html))

这里有一个很有意思的点：尽管瞬时只有绕屏幕 $x,y$ 两个方向的角速度，连续操作仍然可以到达任意姿态，因为三维旋转不对易。例如小角度下，

$$
R_x(\epsilon)R_y(\epsilon)R_x(-\epsilon)R_y(-\epsilon)
$$

会产生一个约为 $\epsilon^2$ 的绕 $z$ 轴旋转。也就是说，第三个方向可以通过一串二维操作“合成”出来。这正是为什么它能用，但又很难用一句“横拖控制什么、竖拖控制什么”完全描述。

## 2. 常见的几种 3D 鼠标旋转

| 方法 | 拖动含义 | 优点 | 主要问题 |
|---|---|---|---|
| **Turntable / Orbit** | 横拖改方位角，竖拖改仰角；固定一个 up 轴 | 极可预测，不容易倒置 | 没有直接 roll |
| **屏幕双轴旋转** | 转轴始终垂直于鼠标运动，类似 VESTA 手册的描述 | 很像“用手推物体” | 上下方向会逐渐漂移，roll 是间接产生的 |
| **Arcball / Virtual Sphere** | 将鼠标位置投影到虚拟球面，旋转两个球面点之间的弧 | 自由、连续，适合任意物体 | 容易失去“哪边是上”的感觉 |
| **轴环/Gizmo** | 拖红绿蓝旋转环，明确绕某一轴 | 精确、可解释 | 复合旋转比较慢 |
| **角度滑块** | 分别设置若干旋转角 | 数值精确 | 欧拉角有顺序依赖，交互感较差 |
| **标准方向吸附** | 点击 Front/Top/某晶向 | 完全可复现 | 不能代替自由探索 |

### Turntable

这是很多通用 3D viewer 的默认：

$$
\Delta x\longrightarrow \text{绕固定 up 轴旋转},
$$

$$
\Delta y\longrightarrow \text{绕当前 camera-right 轴旋转}.
$$

它相当于把物体放在转盘上：水平可以转一圈，竖直可以抬头低头，但地平线保持水平。Three.js 的 `OrbitControls` 明确保持 `object.up`；Blender 也把 Turntable 定义为“保持地平线水平”，而 Trackball 允许任意朝向。([threejs.org](https://threejs.org/docs/pages/OrbitControls.html))

这通常是**最适合默认模式**的，因为用户很少会迷路。

### Arcball

Arcball 会把鼠标的起点和终点映射到一个虚拟球面上的两个单位向量：

$$
\mathbf v_0,\mathbf v_1\in S^2 .
$$

旋转轴和旋转角为

$$
\mathbf a=\mathbf v_0\times\mathbf v_1,
$$

$$
\theta=
\operatorname{atan2}
\left(
\|\mathbf v_0\times\mathbf v_1\|,
\mathbf v_0\cdot\mathbf v_1
\right).
$$

然后用四元数更新姿态：

$$
\Delta q=
\left(
\cos\frac{\theta}{2},
\hat{\mathbf a}\sin\frac{\theta}{2}
\right).
$$

与简单的 $(\Delta x,\Delta y)$ 映射不同，Arcball 中**鼠标位于球的中心附近还是边缘附近会产生不同效果**：中心附近主要是倾斜，边缘附近的切向运动更容易形成绕视线的 roll。Shoemake 特别强调了可逆性、约束旋转和视觉反馈。([Graphics Interface](https://graphicsinterface.org/wp-content/uploads/gi1992-18.pdf))

早期用户实验比较了传统三个滑块、重叠滑块、连续双轴控制和虚拟球。结论大体是：简单单轴任务中滑块稍精确；复杂姿态匹配中，连续控制和虚拟球明显更快，用户也普遍觉得虚拟球更“自然”。([微软](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/08/3-d-rotation-88.pdf))

因此不存在一个同时最自由、最精确、最不迷路的控制器。成熟软件一般都是**自由操作 + 约束操作 + 标准方向**三者并存。

## 3. 晶体和普通 3D 物体最大的不同

晶体自带两套天然坐标系：

$$
A=
\begin{bmatrix}
\mathbf a & \mathbf b & \mathbf c
\end{bmatrix}
$$

以及倒易基底

$$
B=A^{-T}
$$

这里忽略不影响方向的 $2\pi$ 约定。

沿晶向 $[uvw]$ 观察，对应的笛卡尔方向是

$$
\mathbf d_{[uvw]}
=
u\mathbf a+v\mathbf b+w\mathbf c
=
A
\begin{bmatrix}
u\\v\\w
\end{bmatrix}.
$$

垂直于晶面 $(hkl)$ 观察，对应的方向是

$$
\mathbf n_{(hkl)}
=
h\mathbf a^*+k\mathbf b^*+l\mathbf c^*
=
B
\begin{bmatrix}
h\\k\\l
\end{bmatrix}.
$$

对于非正交晶胞，**沿 $c$ 看**和**垂直于 $(001)$ 看**通常不是同一件事；后者是沿 $c^*$ 看。这是通用 ViewCube 很容易掩盖、但晶体 viewer 必须明确表达的地方。

VESTA 的精确视角设置其实已经采用了很正确的思路：视线既可以指定为直接晶格方向 $[uvw]$，也可以指定为晶面法向 $[hkl]^*$；此外还要指定一个屏幕向上的方向。它的六个快捷按钮分别是 $a,b,c,a^*,b^*,c^*$。([jp-minerals.org](https://jp-minerals.org/vesta/en/doc/VESTAch10.html))

## 4. 为什么仅指定 $[uvw]$ 还不够

假设视线已经沿 $[111]$，你仍然可以绕 $[111]$ 把画面转一整圈。所以要完全确定画面，还需要一个 **screen-up vector**。

给定视线方向 $\mathbf d$ 和一个候选向上方向 $\mathbf u_0$，可以构造相机基底：

$$
\mathbf f=\frac{\mathbf d}{\|\mathbf d\|},
$$

$$
\mathbf u=
\frac{
\mathbf u_0-(\mathbf u_0\cdot\mathbf f)\mathbf f
}{
\left\|
\mathbf u_0-(\mathbf u_0\cdot\mathbf f)\mathbf f
\right\|
},
$$

$$
\mathbf r=\mathbf f\times\mathbf u.
$$

其中 $\mathbf f,\mathbf u,\mathbf r$ 分别是视线、屏幕向上和屏幕向右方向。

VESTA 允许用一组直接晶格向量和倒易晶格向量指定这两个方向。它们垂直的条件正好是

$$
hu+kv+lw=0,
$$

因为

$$
(h\mathbf a^*+k\mathbf b^*+l\mathbf c^*)
\cdot
(u\mathbf a+v\mathbf b+w\mathbf c)
=
hu+kv+lw.
$$

这套“**视线方向 + 屏幕向上方向**”比三个 Euler angle 更适合晶体，也更容易复现。([jp-minerals.org](https://jp-minerals.org/vesta/en/doc/VESTAch10.html))

## 5. “两个转盘”怎样设计才合理

### 只有两个控件的版本

两个控件可以定义：

$$
\phi=\text{绕选定 up 轴的方位角},
$$

$$
\theta=\text{仰角}.
$$

这样控制的是视线方向 $S^2$，并强制 roll 为零。界面上应该明确写出类似：

> 保持 $c$ 轴向上  
> 保持 $c^*$ 轴向上  
> 保持 lab $z$ 向上

这是一套完整而可控的 **Turntable 模式**。

缺点是方位角有 $0/360^\circ$ 接缝，仰角在两极有坐标奇点。因此这两个滑块很适合数值微调，但不一定是最好的主要拖动方式。

### 完整姿态版本

完整版本实际上需要：

1. 一个二维控件选择视线方向；
2. 一个圆环控制绕视线旋转。

最合适的形态不是三个普通滑块，而是：

- 中间一个可拖动的 **orientation sphere / pole map**；
- 外围一个 **roll ring**。

中间区域给出视线的两个自由度，外围圆环给出第三个自由度。外围圆环还可以吸附到 $0^\circ,15^\circ,30^\circ,45^\circ,90^\circ$。

对于晶体，可以在这个球面或投影图上标出低指数方向：

$$
[100],[110],[111],\ldots
$$

以及晶面法向：

$$
(100),(110),(111),\ldots
$$

点击标记即可精确对齐，拖动仍然保持连续。

## 6. 我更推荐的一套晶体 viewer 方案

### A. 默认：Explore 模式

使用 Turntable，而不是完全自由的 Arcball：

- 左键拖动：orbit；
- 右键或中键拖动：pan；
- 滚轮：zoom/dolly；
- 双击原子、晶胞或对象：设为新的旋转中心；
- 固定用户选择的 up 方向；
- 默认不加惯性，松手即停。

OVITO 就允许双击对象改变 orbit center，并可以限制某个主轴始终朝上；这两点对大超胞尤其重要，因为几何包围盒中心往往不是用户真正关心的位置。([OVITO](https://www.ovito.org/manual/usage/viewports.html?utm_source=chatgpt.com))

### B. Crystal Align 面板

提供：

- `View along [u v w]`
- `View normal to (h k l)`
- `Screen up [u v w]`
- `Screen up [h k l]*`
- 快捷按钮：$\pm a,\pm b,\pm c,\pm a^*,\pm b^*,\pm c^*$
- “Align view to selected plane”
- “Align selected plane to view”
- 当前视角的 orientation matrix
- 当前最接近的低指数方向及角度误差

例如状态栏显示：

> View normal to (1 1 0), up [0 0 1]  
> Angular deviation: $0.18^\circ$

### C. Free 模式

再提供一个可选 Arcball：

- 用于完全自由翻转；
- 外圈拖动或修饰键拖动控制 roll；
- 可以锁定到 screen、lab 或 lattice 轴；
- 释放后可选择是否吸附到最近低指数方向。

Mercury 采用普通左键拖动旋转，`Shift + 左键`单独控制屏内旋转，`Ctrl + 左键`平移。这说明把 roll 单独分配给一个明确手势，是晶体软件中已经存在的做法。([CCDC](https://www.ccdc.cam.ac.uk/media/HG-Visualisations-Core.pdf?utm_source=chatgpt.com))

### D. 精确旋转模式

提供可见的旋转环或者按钮：

- 绕 screen $x/y/z$
- 绕 lab $x/y/z$
- 绕 lattice $a/b/c$
- 绕 reciprocal $a^*/b^*/c^*$
- 输入步长，例如 $1^\circ,5^\circ,15^\circ,90^\circ$

但要始终明确写出当前旋转所使用的参考系。很多 3D 操作之所以令人困惑，不是旋转本身复杂，而是用户不知道“这个轴属于屏幕、实验室还是晶体”。

## 7. 一个很适合晶体的 ViewCube 替代物

普通 CAD 软件常用 ViewCube，点击面、边、角进入标准视图；它比纯鼠标 orbit 更精确。([Autodesk Help](https://help.autodesk.com/cloudhelp/2014/ENU/SimCFD/files/GUID-6CB7C136-51B2-415A-931D-04F22A84E405.htm?utm_source=chatgpt.com))

但晶体不应该直接使用一个正方体，因为晶胞可能是单斜、三斜或六方。更合适的是一个角落里的 **Unit-cell Navigator**：

- 显示真实形状的晶胞平行六面体；
- 点击边 $a$：沿 $a$ 观察；
- 点击 $bc$ 面：沿该面的法向 $a^*$ 观察；
- 点击 $ab$ 面：沿 $c^*$ 观察；
- 点击晶胞对角线：沿相应 $[uvw]$ 观察；
- 外围带一个 roll ring；
- 可切换 direct / reciprocal 标签。

这样用户会直接看到为什么 $a$ 和 $a^*$ 在一般晶胞里不是同一个方向。

## 8. 实现层面的几个关键决定

底层不要把姿态存成三个可编辑的 Euler angle。推荐保存：

$$
q\in\text{unit quaternions}
$$

或者一个正交旋转矩阵 $R$。

滑块只是当前模式下的 UI 参数：

- Turntable 模式显示 $(\phi,\theta)$；
- Free 模式显示 quaternion、axis-angle，或 $(\phi,\theta,\psi)$；
- Crystal 模式显示 view direction + up direction。

这样鼠标拖动、数值输入和晶向吸附都更新同一个 quaternion，不会因为角度顺序不同而产生不可预测结果。

另外最好把两种变换彻底分开：

- **Camera transform**：用户只是换一个观察角度；
- **Phase/model transform**：晶体相对于实验室坐标真的发生了旋转。

在渲染图像上二者可能看起来相同，但在多相晶体、应变、取向关系和轨迹数据中，语义完全不同。

## 最终建议

最稳妥的组合不是只选择某一种鼠标算法，而是：

> **Turntable 作为默认探索方式  
> + Arcball 作为自由模式  
> + $[uvw]$/(hkl) 与 screen-up 作为精确表示  
> + Unit-cell Navigator 与低指数吸附作为晶体专属交互。**

而你提到的滑块，适合做成双向绑定的：

$$
\text{azimuth}+\text{elevation}
$$

并明确“roll 已锁定”；需要完整自由姿态时，再展开第三个 roll 圆环。这样既保留了鼠标拖动的自然感，又不会牺牲晶体视角的可解释性和可复现性。

---

**Sources:**

- [](https://graphicsinterface.org/wp-content/uploads/gi1992-18.pdf)
- [11 INTERACTIVE MANIPULATIONS](https://jp-minerals.org/vesta/en/doc/VESTAch11.html)
- [OrbitControls - Three.js Docs](https://threejs.org/docs/pages/OrbitControls.html)
- [1900167b.tif](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/08/3-d-rotation-88.pdf)
- [Viewport windows — OVITO User Manual 3.15.4 ...](https://www.ovito.org/manual/usage/viewports.html?utm_source=chatgpt.com)
- [Structure Visualisations (MER-001)](https://www.ccdc.cam.ac.uk/media/HG-Visualisations-Core.pdf?utm_source=chatgpt.com)
- [Help: Orient the Model with the ViewCube](https://help.autodesk.com/cloudhelp/2014/ENU/SimCFD/files/GUID-6CB7C136-51B2-415A-931D-04F22A84E405.htm?utm_source=chatgpt.com)



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
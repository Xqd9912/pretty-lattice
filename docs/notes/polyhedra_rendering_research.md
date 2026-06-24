# Coordination Polyhedra Rendering Notes

调研日期：2026-06-24

## 一句话版

在晶体可视化里，coordination polyhedron 不应该先想成一个新的“成键算法”。更朴素地说，它是：

1. 选一个中心原子。
2. 找到这个中心原子的配位邻居。
3. 把这些邻居原子当成多面体顶点，生成一个包住它们的面壳。
4. 用半透明面、边线、中心原子颜色把它画出来。

所以 polyhedra 的关键不在“怎么凭空画面”，而在“中心是谁、邻居是谁、周期边界外的邻居要不要补齐、面壳怎么稳定生成”。我们现在已经有 pymatgen + `CrystalNN` 的 bonding，这正好可以成为 polyhedra 的上游。

## 外部实践依据

### VESTA

VESTA 的 polyhedra 跟 bond specification 绑定，而不是独立识别一个抽象多面体。手册第 8 章说明，bond 搜索有三种模式：`Search A2 bonded to A1`、`Search atoms bonded to A1`、`Search molecules`。前两种可以创建 coordination polyhedra，因为它们有明确的中心 A1；`Search molecules` 没有中心原子信息，所以不创建 coordination polyhedra。`Show polyhedra` 的语义就是把 A1 当成 polyhedron center。[VESTA chapter 8](https://jp-minerals.org/vesta/en/doc/VESTAch8.html)

VESTA 也很重视边界补全。默认的 Boundary mode 2 是：如果 A1 在 drawing boundary 内，就继续搜索所有 bonded A2，即使 A2 在边界外；如果 A1 在边界外则不搜索。这样可以避免多面体被晶胞边界截断。[VESTA chapter 8](https://jp-minerals.org/vesta/en/doc/VESTAch8.html)

VESTA 第 12 章把 polyhedra 作为渲染对象处理：表面透明度、polyhedral style、按中心元素着色、边线可见性/线宽/颜色。默认面颜色与中心原子颜色一致。也就是说，VESTA 的实践是“邻居搜索在对象生成阶段完成，表面/边线是 display style”。[VESTA chapter 12](https://jp-minerals.org/vesta/en/doc/VESTAch12.html)

### pymatgen

pymatgen 的 `CrystalNN.get_nn_info(structure, index)` 返回每个近邻的 `site`、周期 `image`、`weight`、`site_index`。我用本项目当前 `.venv` 中的 pymatgen 源码核对过，路径是 `.venv/lib/python3.12/site-packages/pymatgen/core/local_env.py`：`CrystalNN` 先调用 `VoronoiNN(weight="solid_angle")` 得到候选邻居，再做 porous/layered 修正、电负性差权重、距离 cutoff 权重，然后选择最可能的 coordination number。官方文档也把 `pymatgen.analysis.local_env` 定义为针对单个 site 的 local environment / near-neighbor 分析模块。[pymatgen analysis docs](https://pymatgen.org/pymatgen.analysis.html)

一个容易踩坑的点：`VoronoiNN.get_voronoi_polyhedra()` 里的 polyhedra 是 Voronoi cell 的面统计，返回的是 shared facet 的 `solid_angle`、`area`、`face_dist`、`volume` 等，用于 neighbor weighting；它不是 VESTA 风格“中心原子周围配位原子构成的可视化多面体网格”。所以我们不应该直接把 `VoronoiNN.get_voronoi_polyhedra()` 当作 polyhedra mesh 生成器。

`pymatgen.analysis.chemenv` 是更高阶的 coordination environment 识别工具，目标是识别 tetrahedron、octahedron 等理想环境并计算 continuous symmetry measure。它适合以后给 polyhedra 加“这是八面体/四面体、畸变程度如何”的语义，但第一版渲染不需要先接入 ChemEnv。[ChemEnv docs](https://pymatgen.org/pymatgen.analysis.chemenv.coordination_environments.html)

### Crystal Toolkit

Crystal Toolkit 是很有参考价值的 pymatgen 前端实践。它的 `StructureMoleculeComponent` 先用 pymatgen `NearNeighbors` 策略生成 `StructureGraph`，默认 bonding strategy 是 `CrystalNN`，然后把 graph 转成 scene。它的 display options 包括 `draw_image_atoms`、`bonded_sites_outside_unit_cell`、`hide_incomplete_bonds`，这和我们现在的 boundary atoms / one-hop bonded atoms 思路很接近。[Crystal Toolkit component source](https://docs.crystaltoolkit.org/_modules/crystal_toolkit/components/structure.html)

Crystal Toolkit 的 `structuregraph` renderable 先决定哪些 site/image 要画：基础 cell 内 site、边界重复 site、以及 bonded outside unit cell 的 site。然后每个 site 调 `site.get_scene(...)` 生成 atoms、bonds、polyhedra。[Crystal Toolkit StructureGraph renderable](https://docs.crystaltoolkit.org/_modules/crystal_toolkit/renderables/structuregraph.html)

在 `site.get_scene` 中，polyhedron 只有在这些条件下才画：有 connected sites、邻居数量大于 3、没有 missing connected site，并且通过一个避免相交/重复多面体的中心选择启发式。具体 mesh 生成有两种路径：默认交给 `Convex` primitive；显式计算时用 SciPy 的 Delaunay `convex_hull`。这说明业界实践并不是手写三角剖分，而是复用成熟 convex hull / geometry primitive。[Crystal Toolkit Site renderable](https://docs.crystaltoolkit.org/_modules/crystal_toolkit/renderables/site.html)

## 技术逻辑展开

第一版可实现的算法大概是：

1. 使用现有 bonding 上游得到邻接关系。
   - 默认仍然是 `CrystalNN`。
   - 后端继续负责周期 image offset、canonical atom、boundary image、one-hop bonded image。

2. 选择 polyhedron center。
   - VESTA 的思路是用户指定 A1；我们第一版如果没有新控件，可以先自动选。
   - 建议默认只给“中心比邻居更像阳离子”的 site 画 polyhedron，例如中心元素电负性低于所有邻居，避免 Na-Cl 同时围绕彼此画出互相穿插的壳。
   - 后续再加中心元素/site 选择，比一开始开放复杂规则更稳。

3. 收集 vertex atoms。
   - 对每个中心 atom instance，取它通过 bonding 连接到的 neighbor atom instances。
   - 如果某个邻居在相邻周期 image，就复用现有 one-hop bonded image 机制补齐。
   - 不从 one-hop-only atom 继续递归扩展，保持现在 bonding 的一跳边界。

4. 判断是否能形成 polyhedron。
   - 顶点数小于 4：不画 closed polyhedron。
   - 点近似共面或 `ConvexHull` 失败：跳过该 polyhedron，必要时加 non-fatal warning。
   - 不要为了“看起来有东西”生成误导性的三角扇。

5. 生成 faces。
   - 推荐后端用 `scipy.spatial.ConvexHull` 生成三角面索引，避免自己造 hull 算法。
   - Crystal Toolkit 也走了复用几何库的路线；差别只是它可以把 hull 留给 renderer primitive。
   - 我们如果在后端给出 faces，前端只需要 `BufferGeometry`，测试更容易、scene contract 更明确。

6. 前端渲染。
   - polyhedra surfaces 应该在 atoms 前画，使用半透明 `MeshStandardMaterial`。
   - edges 可以从 face indices 派生，用 `EdgesGeometry` 或 line segments。
   - 默认颜色沿用中心原子颜色；surface opacity、边线颜色和边线透明度属于前端 renderer style，可以先用固定值。

## 对 pretty-lattice 的职责划分建议

### 后端的活

- 继续拥有 crystallographic analysis：neighbor finding、周期 image offset、中心/邻居选择、完整性判断。
- 扩展 scene contract，增加 `polyhedra` 字段，而不是让浏览器自己跑 bonding 或 CrystalNN。
- 尽量从当前 `_build_bonds` 的 neighbor 遍历中抽出共享 connectivity 数据，避免 bonds 和 polyhedra 分别跑一遍 `CrystalNN` 后出现细微不一致。
- 输出稳定 ID、中心 atom ID、hull atom IDs、face indices、颜色、visibility dependency groups。
- polyhedra analysis 失败时返回 atoms/bonds，并加 `polyhedra-analysis-failed` warning，不让整个 preview 失败。

一个可能的 contract：

```ts
interface PolyhedronSpec {
  id: string;
  centerAtomId: string;
  hullAtomIds: string[];
  faces: [number, number, number][];
  color: string;
  visibilityDependencies: VisibilityDependency[];
  visibilityDependencyGroups: VisibilityDependency[][];
}
```

这里 `faces` 的索引指向 `hullAtomIds`，前端通过 `atomById` 拿坐标。这样 atoms toggle 关掉时，polyhedra 仍然可以画；但 boundary / one-hop toggles 关掉时，可以按 hull atom IDs 正确过滤。

### 前端的活

- 扩展 `SceneSpec`、`ComponentVisibilityState` 和 `visibleSceneForComponents`。
- 把 Polyhedra checkbox 从 disabled 变成可用；默认可以在 scene 有 polyhedra 时开启。
- 新增 `Polyhedron` render component：根据 `hullAtomIds` 找坐标，用 `faces` 构造 `BufferGeometry`，再画 surface 和 edge overlay。
- 保持 atoms / bonds / polyhedra 三者独立显示：关 atoms 不应强制隐藏 polyhedra；关 boundary/one-hop image 时，依赖隐藏 atom image 的 polyhedra 应被过滤。
- 注意透明物体排序：surface 先画、atoms/bonds 后画，必要时设置 `renderOrder` 和 `depthWrite={false}`。

### 不用造的轮子

- 不用造 neighbor / bonding algorithm：继续用 pymatgen `CrystalNN` / `MinimumDistanceNN` / `VoronoiNN` allowlist。
- 不用造 convex hull：后端用 SciPy `ConvexHull`，或前端用 Three.js convex geometry；第一版我更建议后端 faces。
- 不用造周期邻居补全：沿用当前 atom_records、image offset、one-hop bonded image 机制。
- 不用造 VESTA color/radius 数据：已有 `elements.toml` 和 `colormaps/vesta.toml`。
- 不用一开始造 ChemEnv 分类：shape labeling 可以作为后续分析层。

### 需要我们自己造的部分

- 项目自己的 `PolyhedronSpec` JSON contract。
- 中心选择策略：默认启发式、后续用户选择入口。
- 和现有 component visibility / image dependency 的整合。
- 生成 polyhedra 的测试 fixtures：至少覆盖 SrTiO3/TiO2/NaCl/Si 这类典型和反例。
- 前端材质、surface opacity、edge style，以及和 atoms/bonds 的渲染顺序。

## 建议的第一版落地顺序

1. 后端先重构 bonding 遍历，形成一个内部 connectivity result，同时服务 bonds 和 polyhedra。
2. 增加 `polyhedra` contract，但先只对 canonical centers 生成；vertex 可以引用 one-hop image atoms。
3. 用 `ConvexHull` 生成 faces，失败就跳过该 center。
4. 前端只实现 renderer 和 toggle，不加复杂 style panel。
5. 用 fixture snapshot 测 ID 稳定性、face 数量非空、boundary/one-hop filter 不产生断裂 polyhedron。
6. 再考虑中心元素选择、style controls、ChemEnv label。

## 最小结论

我们不需要重新发明 VESTA。比较稳的路线是：后端继续以 pymatgen bonding 为事实来源，把“完整的配位壳”整理成 render-ready `PolyhedronSpec`；前端只负责把已有顶点和面索引画成半透明 surface + edges。这样既符合 VESTA 的 A1-centered practice，也符合我们现在“浏览器不做晶体分析”的架构边界。

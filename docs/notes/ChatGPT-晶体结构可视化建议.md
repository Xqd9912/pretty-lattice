# 晶体结构可视化建议

**User:** Anonymous  
**Created:** 6/22/2026 13:54:52  
**Updated:** 6/22/2026 13:57:06  
**Exported:** 6/22/2026 13:58:52  
**Link:** [https://chatgpt.com/g/g-p-6a375ccb358c81919a6c68164d494952/c/6a38cdfe-1898-83e8-a8af-2b582d5a2ad8](https://chatgpt.com/g/g-p-6a375ccb358c81919a6c68164d494952/c/6a38cdfe-1898-83e8-a8af-2b582d5a2ad8)  

## Prompt:
2026/6/22 13:54:50

对，我想和你讨论一下，就是关于这个，就是我们现在给定一个unit cell，对吧有一些原子坐标。但我们这个图里到底应该包含哪些？比如说，就是like有一些在boundary上，对吧？然后包括Vista，它好像默认会把一些就是在这个当前unit cell外，但是也会和这个当前unit cell内成键的那些原子也画出来。就是你去调研一下吧，你觉得我们应该做成什么样？然后有没有一些大家的常见做法或者规范？就是这种画晶体结构的软件。

## Response:
2026/6/22 13:54:52

我会把这个问题拆成两个层面看：数据上“哪些原子属于 cell”，以及视觉上“为了成键/完整多面体/好看额外画哪些 periodic image”。我先查一下 VESTA 和几个常见软件/库的实际做法，再给一个适合 pretty-lattice 的默认策略。

已经查到一个核心点：VESTA 不是简单“显示 [0,1]^3 里的原子”，而是有独立的 drawing boundary 和 bond boundary mode；某些模式会为了不截断配位多面体/分子，额外搜索边界外的周期像。这个设计很值得借鉴，但默认不能完全照抄。

我觉得**不要把“unit cell 里有哪些原子”做成一个单一问题**。更合理的抽象是三层：

1. **真实结构数据层**：每个 crystallographic site 只存一份，周期性通过 lattice + image shift 表达。
2. **drawing boundary 层**：当前想画哪一块空间，默认可以是 fractional range `(0,0,0) → (1,1,1)`。
3. **visual completion 层**：为了不让键、配位多面体、分子被 cell 边界切断，额外生成一些 periodic images。

这个思路其实和 VESTA 很接近：VESTA 的 drawing boundary 是用 fractional coordinate ranges 定义的；bond 搜索又有独立的 Boundary mode。它可以只搜索 boundary 内原子，也可以在 boundary 外继续找键合原子，从而保证配位多面体或分子不被切断。VESTA 手册还明确说，“Search A2 bonded to A1 / Search atoms bonded to A1” 默认会找 boundary 外与 cell 内 A1 相连的 A2；而 “Search molecules” 默认会递归搜索可见原子的连接，但警告说这对无机晶体/金属可能导致无限连接网络。([JP-Minerals](https://jp-minerals.org/vesta/en/doc/VESTAch10.html))

## 我建议 pretty-lattice 的默认策略

**默认：画一个 unit cell，但启用 one-hop bond completion。**

也就是说：

- 主原子：显示 fractional 坐标在主 cell 内的原子。
- 边界原子：用半开区间 `[0,1)` 做数据归一化，避免 `(0,0,0)` 和 `(1,0,0)` 被当成两个真实原子。
- 成键：用 PBC 找最近 periodic image，不画穿过整个 cell 的“长假键”。
- 如果一个 cell 内原子和 cell 外周期像成键，则额外画出那个 cell 外的 ghost atom / image atom，以及对应的短键。
- 但**只做一跳，不递归扩张**。这样不会像 molecular completion 那样在无机 framework 里越长越大。

这基本等价于一个温和版的 VESTA “Search additional atoms if A1 is included in the boundary”，适合无机晶体、2D 材料、配位多面体、普通 ball-and-stick 图。

## 需要提供的几个显示模式

我会把它设计成几个明确 mode，而不是让用户猜软件在干嘛：

| 模式 | 行为 | 适用场景 |
|---|---|---|
| `unique-cell` | 只画主 cell 内唯一原子，不补边界外原子 | debug、结构数据检查 |
| `cell-complete-bonds` | 主 cell 原子 + 一跳 boundary 外成键原子 | **默认推荐** |
| `closed-cell` | 把边界上的等价原子也画在所有 cell 边/角上 | 教科书式 conventional cell 图 |
| `molecule-complete` | 对分子晶体显示完整分子，可跨越 cell 边界 | 有机/分子晶体 |
| `supercell` | 明确画 `na × nb × nc` 周期重复 | 展示层状结构、packing、moire-ish 图 |
| `slice/slab` | 用 plane 或 fractional range 切一块 | 表面、薄片、局部结构 |

这里 `molecule-complete` 不应该是无机材料默认。CrystalMaker 也有类似 “Show Molecular Cell”：它会选择完整分子来构成一个 unit cell 的内容，甚至允许一些原子跨越 unit-cell boundary，同时隐藏另一些 cell 内原子，以保证显示的是“一胞量”的完整分子。这个逻辑对分子晶体很好，但对无限无机网络不自然。([CrystalMaker](https://crystalmaker.com/support/advice/pages/cm-display-intact-molecules.html))

## boundary 上的原子怎么处理

这块很容易混乱。我建议：

**数据层永远用半开胞：**

```text
0 <= f_a < 1
0 <= f_b < 1
0 <= f_c < 1
```

所以如果读入一个原子在 `f_a = 1.0`，内部 normalize 成 `f_a = 0.0`。这和 ASE 这类库的 wrap 思路一致：ASE 的 `get_scaled_positions(wrap=True)` 会把周期方向上 cell 外原子 wrap 回 cell，使 scaled coordinates 落在 0 到 1 之间。([ASE 文档](https://ase-lib.org/ase/atoms.html))

但**视觉层可以复制边界像**。例如一个原子在 `(0,0,0)`：

- `unique-cell`：只画一个角上的原子。
- `closed-cell`：可以把它的周期像画到 8 个角上，看起来像传统晶胞图。
- 但这些复制品应该带同一个 `site_id`，只是不同 `image = (n_a,n_b,n_c)`，不要变成真实新增原子。

这点很重要：**“画了多个球”不等于“结构里有多个原子”。**

## bond 的内部表示要比 atom display 更严谨

我强烈建议 bond 不要只存两点坐标，而要存：

```text
(i, j, image_shift)
```

例如：

```text
atom i in cell (0,0,0)
bonded to atom j in image (1,0,0)
```

这样你永远知道这是一个跨 PBC 的键。OVITO 也是类似思想：它给每条 bond 维护一个 `Periodic Image` triplet，表示这条键是否跨越周期边界；跨边界的键会被可视化成 cell 两侧的 half-bonds。([OVITO](https://www.ovito.org/manual/reference/pipelines/modifiers/create_bonds.html))

对 pretty-lattice 来说，渲染时可以有两种视觉策略：

- **VESTA-like ghost endpoint**：在 cell 外画出成键的 periodic image 原子，键是完整短键。更适合静态论文图。
- **OVITO-like split bond**：键在 cell 边界处分成两段，不额外画完整外部原子。更适合 simulation / PBC debug。

我会把 **ghost endpoint** 作为默认，因为你的目标是漂亮、直观、论文图，而不是纯 MD viewer。

## 常见软件的做法可以总结成这样

VESTA：核心是 drawing boundary + bond boundary mode。它允许 fractional range 定义绘图范围，并可为了完整配位多面体/分子而搜索 boundary 外原子；但递归分子模式不适合一般无机无限网络。([JP-Minerals](https://jp-minerals.org/vesta/en/doc/VESTAch10.html))

Jmol / IUCr figure toolkit：会区分 asymmetric unit、应用对称后的 unit-cell contents、central cell contents、packing nets 等；它还明确说某些 unit-cell contents 选项会显示 basic unit-cell boundary 外的原子，而 central cell 选项只显示边界内原子。([IUCr Journals](https://journals.iucr.org/services/help/jtkt/9.html))

CCDC / Mercury 系：packing/slicing 里有 inclusion criterion，比如 `CentroidIncluded`、`AllAtomsIncluded`、`AnyAtomIncluded`、`OnlyAtomsIncluded`；前三者会扩展成完整 molecule，`OnlyAtomsIncluded` 才是只保留 box 内原子。这说明成熟晶体软件也不是只有一种“在 cell 里”的定义。([剑桥大学计算机决策中心下载](https://downloads.ccdc.cam.ac.uk/documentation/API/descriptive_docs/crystal.html))

OVITO：更偏 simulation/PBC 数据模型，支持 wrap 到 primary cell、复制 periodic images，并用 per-bond periodic-image shift 处理跨边界键。([OVITO](https://www.ovito.org/docs/current/reference/pipelines/modifiers/wrap_at_periodic_boundaries.html))

## 我会给 pretty-lattice 定的默认值

我建议默认叫：

```yaml
region:
  type: unit_cell
  range: [[0, 0, 0], [1, 1, 1]]

atoms:
  mode: primary_plus_boundary_images
  boundary_policy: half_open_data_closed_visual

bonds:
  pbc: true
  completion: one_hop
  crossing_style: ghost_endpoint

molecules:
  completion: off
```

翻译成人话就是：

**内部只认一份原子；视觉上画一个单胞；如果键跨出单胞，就补出一跳外部周期像；不递归扩成大团；边界重复只是视觉复制，不改变结构。**

这应该是最适合 pretty-lattice 的折中：比“只画 cell 内原子”更完整，比 VESTA 的递归分子 completion 更克制，也比纯 simulation viewer 更适合论文图。

---

**Sources:**

- [10 DEFINING DRAWING BOUNDARIES AND VIEW DIRECTIONS](https://jp-minerals.org/vesta/en/doc/VESTAch10.html)
- [Displaying Intact Molecules](https://crystalmaker.com/support/advice/pages/cm-display-intact-molecules.html)
- [The Atoms object — ASE  documentation](https://ase-lib.org/ase/atoms.html)
- [Create bonds — OVITO User Manual 3.15.5 documentation](https://www.ovito.org/manual/reference/pipelines/modifiers/create_bonds.html)
- [(IUCr) Jmol enhanced figure toolkit](https://journals.iucr.org/services/help/jtkt/9.html)
- [Working with crystals — CSD Python API 3.7.1 documentation](https://downloads.ccdc.cam.ac.uk/documentation/API/descriptive_docs/crystal.html)



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
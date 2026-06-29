# 动态分配颜色方案

**User:** Anonymous  
**Created:** 6/29/2026 22:21:05  
**Updated:** 6/29/2026 23:18:51  
**Exported:** 6/29/2026 23:22:22  
**Link:** [https://chatgpt.com/g/g-p-6a375ccb358c81919a6c68164d494952-pretty-lattice/c/6a427f4d-e270-83e8-8fd4-de25495d5e05](https://chatgpt.com/g/g-p-6a375ccb358c81919a6c68164d494952-pretty-lattice/c/6a427f4d-e270-83e8-8fd4-de25495d5e05)  

## Prompt:
2026/6/29 22:21:01

我想继续跟你讨论一下这个原子的上色方案。我们现在建了几个固定的color map，但是好像有的时候会遇到这个，比如说有相近的颜色。然后是不是有这个，你查一查，在一些主流软件里有没有这个动态分配颜色的这个做法。然后以及这个这个有没有什么大家常用的配色方案之类的？然后他们是怎么动态分配的？

## Response:
2026/6/29 22:21:05

我先把问题拆成两层看：一层是“元素颜色”在主流软件里是不是固定语义，另一层是“当前结构里若有多个物种颜色太近”时有没有动态避让。重点会放在晶体/分子可视化软件的实际做法，而不是泛泛的设计理论。

目前查到的方向很清楚：晶体/分子软件里，“元素 → 颜色”基本被当成稳定语义；真正动态分配颜色的地方，更多是 chain、residue、particle type、index、数值场这些“当前数据集的类别/属性”。下一步我把它翻译成我们项目能用的设计方案。

结论：**有动态分配颜色的做法，但主流软件通常不把它用于“元素颜色”的默认模式**。元素颜色一般保持固定语义；动态颜色更多用于 chain、site property、Wyckoff label、particle type、index、数值场这些“当前数据里的类别/属性”。

## 1. 主流软件的常见逻辑

**Jmol / JSmol**：默认是固定的 CPK/Jmol 元素色，`color cpk` 按元素上色；但它也有 `chain`、二级结构、残基、charge、temperature 等其他上色模式。也就是说，元素色固定，动态/属性色另开模式。([Jmol](https://jmol.sourceforge.net/jscolors/))

**VESTA**：也是按元素存半径和颜色；颜色可以在属性面板里按元素编辑，`elements.ini` 存默认半径/颜色。bicolor bond 也是直接取两端原子的颜色。它不像是自动为“当前结构里的元素集合”重新优化颜色。([JP-Minerals](https://jp-minerals.org/vesta/en/doc/VESTAch12.html))

**pymatgen**：可视化默认用 Jmol scheme；用户可以传 `element_color_mapping` 覆盖。也就是“固定表 + 手动覆盖”。([pymatgen](https://pymatgen.org/pymatgen.vis.html))

**Avogadro**：默认按元素上色；另外提供按 charge、index、distance 等属性的 colormap。([Avogadro](https://two.avogadro.cc/docs/menus/view-menu.html))

**OVITO**：如果 particle type 名字匹配化学元素，会从内部元素预设数据库自动给显示颜色、半径、质量等；同时它有 `Color by type` 给离散类型上色，也有 `Color coding` 把连续属性映射到渐变色。([OVITO](https://www.ovito.org/manual/reference/pipelines/data_objects/particles.html))

所以大趋势是：**元素色 = 固定、可识别、可复现；属性色/类别色 = 可动态分配。**

## 2. 最接近你说的“动态元素配色”的例子：Crystal Toolkit / Materials Project 系

Crystal Toolkit 这里很有意思。它的 `Legend` 支持 `"VESTA"`, `"Jmol"`, `"accessible"`，也支持按 scalar site property 或 categorical site property 上色。源码里明确有一个 `generate_accessible_color_scheme_on_the_fly(site_collection)`。([docs.crystaltoolkit.org](https://docs.crystaltoolkit.org/_modules/crystal_toolkit/core/legend.html))

它的 **accessible 动态方案**大概是：

先收集当前结构里出现的元素；

用一套 9 色的色盲友好 palette，基本就是 Okabe-Ito/Wong 风格：黑、橙、天蓝、蓝绿、黄、蓝、朱红、紫红、白；

对常见元素保留类似 CPK 的语义偏好：O→朱红，N→天蓝，C→黑，H→白，F/Cl→蓝绿，Fe/P→橙，S→黄，Br/I→紫红；

剩下的元素再从没用过的 palette 里分配；如果当前元素数超过 palette 数量，就 warning。([docs.crystaltoolkit.org](https://docs.crystaltoolkit.org/_modules/crystal_toolkit/core/legend.html))

它还有 categorical site property 的动态上色：用 ColorBrewer 的 `Set1_9`，通过 `LabelEncoder` 把类别映射到 9 个颜色；类别太多就 warning。([docs.crystaltoolkit.org](https://docs.crystaltoolkit.org/_modules/crystal_toolkit/core/legend.html))

这个实践非常值得我们参考：**不是完全抛弃元素语义，而是在一个有限的 accessible palette 里优先锁定 C/O/N/H/S/卤素/Fe 这些“大家有预期”的颜色。**

## 3. Mol* / RCSB PDB 的做法：动态颜色用于 chain / entity，不主要用于元素

Mol* 的默认生物大分子视图大量使用动态类别色，比如 Chain ID：每条 polymer chain 用不同颜色；RCSB 文档还说它用 ColorBrewer 风格的 sequential / diverging / qualitative palettes，定性 palette 包括 Set-1、Set-2、Set-3、Dark-2、Paired、Many-Distinct 等，其中 Many-Distinct 有 25 个颜色，并用于 chain ID 的默认着色。([RCSB PDB](https://www.rcsb.org/docs/3d-viewers/mol%2A/maneuvering-in-mol%2A))

Mol* 的 palette 机制也支持“generate distinct colors”：参数包括 hue、chroma、luminance、maxCount、clusteringStepCount、minSampleCount。源码里 `distinctColors` 是在 HCL/Lab 空间采样、聚类、按对比度排序，并注明受 iWantHue 启发。([dash-molstar.readthedocs.io](https://dash-molstar.readthedocs.io/en/latest/representations.html))

这个对我们也很有启发：**如果要做真正的自动区分，可以在 OKLab/OKLCH 或 Lab/HCL 空间里优化，而不是在 RGB 里拍脑袋。**

## 4. 常用 palette 可以分三类

**元素语义 palette**：Jmol/CPK、RasMol/CPK、VESTA、PubChem 这一类。优点是用户熟悉，缺点是很多元素颜色相近，尤其过渡金属、镧系、某些浅色元素。

**小 N 类别 palette**：Okabe-Ito、Paul Tol、ColorBrewer qualitative，例如 Set1/Set2/Set3/Dark2/Paired/Accent。ColorBrewer 明确说 qualitative schemes 适合 nominal/categorical data，主要靠 hue 区分类别，不表达大小顺序。([colorbrewer2.org](https://colorbrewer2.org/learnmore/schemes_full.html))

**大 N / 自动生成 palette**：iWantHue、Glasbey、distinctipy、Mol* distinctColors 这类。它们的共同逻辑是：在感知空间里挑一组彼此距离尽量大的颜色。iWantHue 的定位就是生成 optimally distinct colors；Glasbey 也是为 categorical data 算法生成颜色；distinctipy 则是每次选一个尽量远离已有颜色的新颜色。([medialab.github.io](https://medialab.github.io/iwanthue/))

## 5. 我对 pretty-lattice 的建议

我会这样设计：

**默认模式仍然用固定元素色**，比如 `Pretty`、`Jmol`、`VESTA`、`Accessible`。不要默认动态改元素颜色，因为用户会期待 O 是红、N 是蓝、C 是灰/黑、H 是白；论文图也需要可复现。

然后加一个可选的：

**“Auto distinguish visible elements” / “自动区分当前元素”**  
这不是新的主默认，而是一个 presentation/export 辅助模式。

它的算法可以这样：

1. 取当前可见元素列表，按 atomic number 排序，保证确定性。
2. 从当前 base colormap 开始，比如 Pretty 或 Accessible。
3. 检查当前结构内两两颜色是否太近，最好在 OKLab/OKLCH 里算距离，同时检查在浅/深背景上的对比。
4. 锁定强语义元素：O、N、C、H、S、P、F/Cl、Br/I、常见金属可以尽量保留原 hue。
5. 对冲突元素，只移动“不那么有强语义”的那个；优先做轻微 hue shift / lightness shift，其次从 Okabe-Ito、Paul Tol、ColorBrewer、Glasbey 候选池里选一个。
6. 每次选候选色时，最大化它到所有已分配颜色、背景色、边框色的最小距离。
7. 导出图时把最终 legend 固定下来，最好能保存到 scene JSON，避免同一个材料下次打开颜色变了。

核心原则是：**不是“随机给每种元素一个颜色”，而是“固定元素语义优先，只有当前结构里真的撞色时才局部修正”。**

我觉得最实用的 UI 是：

`Color scheme: Pretty / Jmol / VESTA / Accessible / Auto-distinct`

其中 `Auto-distinct` 可以显示一个小提示：  
“Optimizes colors for currently visible elements; colors may differ from standard element colors.”

这样用户不会误以为它是标准 CPK 色。

---

**Sources:**

- [Colors](https://jmol.sourceforge.net/jscolors/)
- [12 PROPERTIES OF OBJECTS](https://jp-minerals.org/vesta/en/doc/VESTAch12.html)
- [pymatgen.vis package — pymatgen 2026.5.18 documentation](https://pymatgen.org/pymatgen.vis.html)
- [View Menu — Avogadro 2.0.0 documentation](https://two.avogadro.cc/docs/menus/view-menu.html)
- [Particles — OVITO User Manual 3.15.5 documentation](https://www.ovito.org/manual/reference/pipelines/data_objects/particles.html)
- [crystal_toolkit.core.legend — Crystal Toolkit  documentation](https://docs.crystaltoolkit.org/_modules/crystal_toolkit/core/legend.html)
- [Maneuvering in Mol*](https://www.rcsb.org/docs/3d-viewers/mol%2A/maneuvering-in-mol%2A)
- [Representations — dash-molstar 1.4.0 documentation](https://dash-molstar.readthedocs.io/en/latest/representations.html)
- [Color scheme types - ColorBrewer](https://colorbrewer2.org/learnmore/schemes_full.html)
- [iWantHue](https://medialab.github.io/iwanthue/)

## Prompt:
2026/6/29 23:16:19

好，我们来讨论一下你说的这个auto distinguish的模式。这样我们就把这个就加在一个固定的color map上吧。然后我们讨论一下这个细节。第一个候选色到底应该怎么选？你能给我一个最佳的方案吗？是应该有一个固定的候选池子，还是说现场计算一个？然后另外考虑到我们不同的这个color map下，候选色的风格是不是也应该consistent？

第二，我们是不是应该构建一个元素优先级列表？然后应该如何构建？

## Response:
2026/6/29 23:16:26

我会按“工程上最好落地”的角度回答：先定一个默认算法，再说明为什么不用纯固定池或纯现场随机生成；然后给出元素优先级的构造规则。

我觉得关键不是“候选池 vs 现场计算”二选一，而是：**候选色现场生成，但从固定规则和固定 style envelope 里生成**。这样既稳定可复现，又不会被一个小池子卡死。

我建议的最佳方案是：

**Auto distinguish 不是一个独立 colormap，而是一个“固定 colormap 后处理器”。**  
也就是：先用 `Pretty / Jmol / VESTA / Accessible` 得到基础元素色，然后只在当前结构里检测到撞色时，局部调整少数元素。

---

## 1. 候选色：不要用纯固定池，也不要完全现场乱算

最好的方案是一个 **deterministic dynamic candidate set**：

> 候选色现场生成，但生成规则固定、可复现，并且受当前 base colormap 的风格约束。

这比两种极端都好。

**纯固定候选池的问题**：  
比如固定一个 Okabe-Ito 或 ColorBrewer Set1。它确实可区分，但风格会突然变成“统计图配色”，不再像 Jmol/VESTA/Pretty 的元素色。ColorBrewer 的 qualitative palettes 本来就是给 nominal/categorical data 用的，主要靠 hue 区分，不表达大小顺序；这适合 chain/site type，不一定适合元素语义。([ColorBrewer](https://colorbrewer2.org/learnmore/schemes_full.html?utm_source=chatgpt.com))

**完全现场优化的问题**：  
如果直接在 OKLCH/Lab 空间里找最大距离颜色，结果可能很好分辨，但会缺乏“元素色”的气质：O 可能变绿，N 可能变橙，图是清楚了，但失去化学语义。

所以推荐混合方案：**现场生成候选色，但从 base colormap 的 style envelope 里生成**。这和 Glasbey / iWantHue 的思想一致：在感知空间里寻找彼此尽量远的颜色，而不是在 RGB 里随便挑。Glasbey 类方法会从允许色域中选出与已有颜色“最大感知差异”的新颜色；iWantHue 也强调在 Hue-Chroma-Lightness 空间里生成 optimally distinct colors。([Colorcet](https://colorcet.holoviz.org/user_guide/Categorical.html?utm_source=chatgpt.com))

---

## 2. 具体候选色分三层

我会给每个需要调整的元素生成三类候选色，按优先级尝试。

### 第一层：local variants，优先保持原来的元素语义

比如当前 base colormap 里 Ti 和 V 太像，那不要一上来把 V 改成大红。先尝试：

- hue 小幅移动：比如 ±12°, ±24°, ±36°
- lightness 小幅移动：比如 ±0.06, ±0.12
- chroma 小幅移动：比如稍微变鲜艳或变柔和
- 尽量保留原来的大致色相

这层的目的：**看起来仍然是原来的 colormap，只是更容易分辨。**

例如：

```text
base color of element X
→ same hue, darker
→ same hue, lighter
→ hue slightly warmer
→ hue slightly cooler
→ slightly higher chroma
→ slightly lower chroma
```

这应该是最常用路径。

---

### 第二层：scheme-style candidates，保持整个 colormap 的风格

如果 local variants 解决不了，就从当前 base colormap 的风格空间里生成候选。

比如：

**Pretty map**：  
现代、柔和、OKLCH 风格，不要太刺眼。候选色应该控制在中等 chroma、中高 lightness。

**Jmol map**：  
颜色更饱和、更传统，候选色可以更强烈一点。

**VESTA map**：  
偏软件默认色，候选色可以略朴素，不要过分设计感。

**Accessible map**：  
候选色应该来自色盲友好 palette，数量不够时再扩展。Crystal Toolkit 的 accessible 模式就是类似思路：它支持 `"VESTA"`, `"Jmol"`, `"accessible"`，并且有 `generate_accessible_color_scheme_on_the_fly` 这种按当前结构生成 accessible 元素色的逻辑。([Crystal Toolkit](https://docs.crystaltoolkit.org/source/crystal_toolkit.core.legend.html?utm_source=chatgpt.com))

这一层的核心是：**不同 base colormap 的 auto distinguish 结果应该 still look like that colormap。**

---

### 第三层：emergency global distinct colors

如果元素很多，或者一堆颜色实在撞得太厉害，再用一个全局 distinct palette。

这里可以用类似 Glasbey / iWantHue 的思路：

```text
sample many OKLCH colors
filter out colors too close to background
filter out too light / too dark / too neon
filter out colors too close to already assigned colors
choose color that maximizes min distance to all existing colors
```

但这应该是 fallback，不是默认行为。

---

## 3. 检测撞色：不要只看 RGB 距离

我建议内部全部转到 **OKLab / OKLCH**。

一个简单的距离函数可以是：

```text
d(c1, c2) = Euclidean distance in OKLab
```

然后设置阈值：

```text
if d < threshold:
    considered too similar
```

实际阈值要靠例子调，但可以先从：

```text
normal vision: d_oklab < 0.10 ~ 0.12
color-vision-deficiency simulation: d_oklab < 0.08 ~ 0.10
```

开始。

更稳一点的版本是：

```text
distance = min(
  OKLab distance under normal vision,
  OKLab distance under simulated protanopia,
  OKLab distance under simulated deuteranopia
)
```

这样可以避免红绿这类在普通视力下还行、色弱下很糟的问题。

---

## 4. 推荐的整体算法

大概是这样：

```text
input:
  visible elements E
  base colormap B
  background color bg
  user-pinned colors P

step 1:
  colors[e] = B[e]

step 2:
  build conflict graph:
    edge(e1, e2) exists if colors are too similar

step 3:
  split conflict graph into connected components

step 4:
  for each conflict component:
    compute lockScore for each element
    keep high-lockScore elements unchanged
    recolor lower-lockScore elements

step 5:
  for each element to recolor:
    generate candidate colors:
      local variants
      scheme-style candidates
      global fallback candidates

step 6:
  choose candidate maximizing:
    distance to all already assigned colors
    distance to background
    similarity to original base color
    consistency with scheme style
    accessibility under color-vision-deficiency simulation

output:
  final element-color mapping
```

最重要的一点：  
**只改冲突组件里的少数元素，不要重新洗牌整个 colormap。**

---

## 5. 候选色 scoring 可以这样写

给候选色 `c` 打分：

```text
score(e, c) =
  + 3.0 * minDistanceToOtherElements(c)
  + 1.5 * minDistanceUnderCVD(c)
  + 1.0 * contrastToBackground(c)
  + 1.0 * styleFitToBaseColormap(c)
  + 0.8 * similarityToOriginalColor(e, c)
  - 2.0 * semanticConfusionPenalty(e, c)
```

解释一下：

**`minDistanceToOtherElements`**  
越不像已有元素色越好。

**`minDistanceUnderCVD`**  
色弱模拟下也要能分开。

**`contrastToBackground`**  
避免 H 白球在白背景上消失，或者深色原子在深灰背景上消失。

**`styleFitToBaseColormap`**  
Pretty-auto 还是 Pretty，Jmol-auto 还是 Jmol。

**`similarityToOriginalColor`**  
元素色不要乱漂。

**`semanticConfusionPenalty`**  
比如不要把非氧元素改成很典型的氧红；不要把非氮元素改成很典型的氮蓝。否则图例里虽然能分辨，但读者第一眼会误解。

---

## 6. 元素优先级：应该有，但不应该是单纯 1-118 的死列表

我建议构建的是 **recolor resistance score**，也就是“这个元素有多不应该被改色”。

不是说 O 永远比 Fe 重要，而是说：

> 当 O 和 Fe 颜色冲突时，优先保留 O 的传统颜色，调整 Fe。  
> 当 Fe 是用户选中的中心元素时，也可以保留 Fe，调整别的。

所以这个优先级应该是：

```text
static chemical convention
+ dynamic visual/context importance
+ user intent
```

---

## 7. 一个可用的元素优先级分层

### Tier 0：用户锁定

最高优先级。

比如用户手动设了：

```text
O = red
Fe = blue
```

那 auto distinguish 不能改。

---

### Tier 1：强语义元素，尽量不改 hue

这些元素的颜色用户最有预期：

```text
O   red
N   blue
C   black / dark gray / gray
H   white / very light gray
S   yellow
F/Cl green-ish
Br  brown / dark red
I   purple / violet
```

这些颜色在分子/晶体图里太常见了。尤其 O 红、N 蓝、C 黑/灰、H 白，最好不要轻易破坏。

注意：H 白在浅背景上可见性很差，所以 H 的方案最好不是改成奇怪颜色，而是：

```text
H remains white/light
+ add outline
+ or slightly gray
```

---

### Tier 2：中等语义元素

这些有一定传统，但不如 O/N/C/H 强：

```text
P
Si
B
alkali metals
alkaline earth metals
common transition metals: Fe, Co, Ni, Cu, Mn, Ti, Cr
```

这里我不会完全禁止改色。比如 Fe 在很多 palette 里有橙/棕语义，但没有 O 红那么强。

---

### Tier 3：低语义、容易被调整的元素

这些最适合被 auto distinguish 调：

```text
most transition metals
post-transition metals
lanthanides
actinides
rare dopants
dummy species / custom species
```

不是说它们不重要，而是说**它们的默认颜色没有那么强的跨软件共识**。在固定元素色表里，最容易出现一堆相近颜色的也正是这些区域。

---

## 8. 更好的做法：优先级 = 静态分层 + 当前结构权重

我建议最终实现不要只写死 tier，而是算一个 `lockScore`：

```text
lockScore(e) =
  1000 * isUserPinned(e)
+  120  * isStrongSemanticElement(e)
+   60  * isMediumSemanticElement(e)
+   40  * isUserSelectedOrFocused(e)
+   20  * visualProminence(e)
+   10  * abundance(e)
-   30  * conflictDegree(e)
```

其中：

**`visualProminence`** 可以按当前场景估计：

```text
number_of_visible_atoms * rendered_radius^2
```

因为一个大球/很多球的元素改色会更影响整体观感。

**`abundance`** 可以用当前结构里元素数量。

**`conflictDegree`** 是这个元素和多少其他元素撞色。撞得越多，越可能需要被调整。

然后在一个撞色 component 里：

```text
keep highest lockScore elements
recolor lower lockScore elements
```

例如：

```text
Fe2O3:
O 和 Fe 撞色 → 保留 O，调整 Fe

LiFePO4:
O、P、Fe 都重要
但 O 最强，P 中等，Fe 中等
如果 P/Fe 撞色，可能调整 Fe 或 P 的 lightness/chroma

La1-xSrxMnO3:
O 保留
Mn 如果是用户关注的中心元素，可以保留
La/Sr 更适合被调整
```

---

## 9. 我觉得 pretty-lattice 最适合的默认策略

最终我会这么定：

```text
Color map:
  Pretty
  Jmol
  VESTA
  Accessible

Modifier:
  [ ] Auto distinguish similar visible elements
```

打开 modifier 后：

1. 默认不动颜色。
2. 只在当前 visible elements 内检测撞色。
3. 冲突时先做 local variants。
4. 再不行才用 scheme-style generated candidates。
5. 最后 fallback 到 global distinct palette。
6. O/N/C/H/S/halogens 尽量保留语义。
7. 用户手动颜色永远优先。
8. 导出时把 final resolved colors 写进 scene JSON / metadata，保证复现。

一句话总结：

**候选色用“受 base colormap 风格约束的现场生成”，元素优先级用“语义锚点 + 当前视觉重要性 + 用户意图”的 lockScore。**

---

**Sources:**

- [Color scheme types](https://colorbrewer2.org/learnmore/schemes_full.html?utm_source=chatgpt.com)
- [Categorical — colorcet v3.2.1 - HoloViz](https://colorcet.holoviz.org/user_guide/Categorical.html?utm_source=chatgpt.com)
- [crystal_toolkit.core.legend module - Crystal Toolkit](https://docs.crystaltoolkit.org/source/crystal_toolkit.core.legend.html?utm_source=chatgpt.com)



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
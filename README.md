<h1 align="center">Pretty Lattice</h1>

<p align="center">
  Pretty Lattice is a crystal visualization tool for creating beautiful, publication-ready figures.
</p>
<p align="center">
  <a href="https://github.com/songfeitong/pretty-lattice/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/songfeitong/pretty-lattice/ci.yml?branch=main&label=CI&style=flat-square"></a>
  <a href="https://pypi.org/project/pretty-lattice/"><img alt="PyPI" src="https://img.shields.io/pypi/v/pretty-lattice?style=flat-square"></a>
  <img alt="Python 3.12+" src="https://img.shields.io/badge/python-3.12+-3776ab?style=flat-square">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
</p>

<p align="center">
  English | <a href="README_zh_CN.md">简体中文</a>
</p>

> This is an extended fork of the original [pretty-lattice](https://github.com/songfeitong/pretty-lattice)
> by [@songfeitong](https://github.com/songfeitong). The crystal **visualization** core is from the
> upstream project; this fork adds **trajectory visualization**, **structure analysis**, and
> **electronic-property analysis**. See [Acknowledgements](#acknowledgements).

- **Pretty**: tasteful defaults for colors, materials, lighting, and depth
- **Simple**: an intuitive browser GUI for loading, viewing, and exporting structures
- **Reliable**: structure parsing and analysis powered by the mature [pymatgen](https://github.com/materialsproject/pymatgen) package
- **Scalable**: smooth interaction with systems up to 10k atoms
- **Customizable**: tune colors, radii, materials, opacity, orientation, and export settings

<p align="center">
  <img src="assets/demo.png" alt="Pretty Lattice interface preview" width="90%">
</p>


## Why

I always find it harder than it should be to make a good-looking crystal figure.

Traditional crystallographic tools such as VESTA are powerful, but their visual defaults often feel outdated: harsh color palettes, low-quality 3D shading, and a lot of manual tweaking before the result looks acceptable. You could import the structure into professional 3D software such as Cinema 4D or Blender, but that feels like overkill and comes with a much steeper learning curve.

Pretty Lattice is my attempt to fill that gap. Built on [Three.js](https://github.com/mrdoob/three.js), it stays (relatively) lightweight without compromising visual quality. It offers a modern, intuitive interface with familiar controls researchers expect, and produces clean, aesthetically pleasing figures out of the box.

> [!NOTE]
> By design, Pretty Lattice focuses on **visualization**. It is not intended to replace mature materials-analysis tools such as VESTA and Materials Studio, and it does not try to provide complex structure editing or analysis workflows. Input files are treated as read-only. The intended workflow is to prepare and analyze structures with more specialized tools, then bring the final structure into Pretty Lattice for viewing, styling, and export.

## Install

```shell
pip install pretty-lattice
```

Or install as an isolated tool with [uv](https://github.com/astral-sh/uv):

```shell
uv tool install pretty-lattice
```

Requirements:

- Python 3.12+
- macOS, Linux, or Windows
- Any modern browser

## Quick start

After installation, start the local GUI:

```shell
prl gui
```

Pretty Lattice starts a local server and opens your browser automatically.

Run once without installing:

```shell
uvx --from pretty-lattice prl gui
```

Useful launch options:

```shell
prl gui --no-open     # start the server without opening a browser
prl gui -p 0          # choose any available port automatically
```

## Examples

### Material presets

<p align="center">
  <img src="assets/SrTiO3-material-presets.png" alt="SrTiO3 material preset examples" width="75%">
</p>

### Color scheme presets

<p align="center">
  <img src="assets/Ba2Ca2Cu3HgO8-color-schemes.png" alt="Ba2Ca2Cu3HgO8 color scheme examples" width="90%">
</p>

### Trajectory visualization

Load a VASP `XDATCAR`, LAMMPS `.dump`, or `.xyz` trajectory and step through the frames
with the built-in player. Dump files that only carry atom types can be mapped to real
elements on the fly, and every frame reuses the same rendering and bond settings.

<p align="center">
  <img src="assets/Traj_visualization.png" alt="Ge-Sb-Te trajectory frames with the frame player" width="90%">
</p>

### Structure analysis

Compute structural and dynamical descriptors over a frame range and explore them with
interactive charts: pair distribution g(r), coordination number, angular distribution,
order parameter, mean squared displacement (total and per element), and ALTBC. Bond
cutoffs are seeded from the first minimum of each g(r) and can be edited before computing
coordination-based quantities.

<p align="center">
  <img src="assets/Analysis_1.png" alt="Structure analysis: g(r) and coordination number" width="90%">
</p>

<p align="center">
  <img src="assets/analysis_2.png" alt="Structure analysis: order parameter, MSD, and ALTBC" width="90%">
</p>

### Electronic properties

Analyze and visualize electronic-structure output from VASP:

- **Charge density (`CHGCAR`)** — render the electron density as a true 3D isosurface
  overlaid on the atoms and bonds (reusing the structure renderer), with adjustable
  isolevel, color, and opacity. Also view orthogonal density slices and the
  low-electron-density (LED) distribution with its fraction (0.22 is the empirical
  phase-change threshold).
- **Electron localization (`ELFCAR`)** — the same volumetric pipeline as `CHGCAR`
  (isosurface, slices) applied to the ELF, kept in its raw `[0, 1]` range, plus a
  statistical distribution curve of ELF values across the grid.
- **Bonding-path profile (`CHGCAR`/`ELFCAR`)** — pick a first atom, then a second from its
  neighbors within a cutoff radius (listed nearest-first with bond lengths), to plot the ELF
  or charge averaged inside a thin cylinder along the line joining them, versus distance from
  the first atom. The cylinder radius is adjustable (default 0.5 Å) so the average stays
  inside the bond channel and clear of neighboring atoms.
- **LOBSTER bonding analysis** — scatter plots of the bond-weighted distribution function
  (`BWDF.lobster`) and the integrated crystal-orbital Hamilton/overlap populations
  (`ICOHPLIST.lobster`, `ICOOPLIST.lobster`) against bond length, with adjustable marker
  size/color and per-element-pair (e.g. Ge–Ge, Ge–Se, Se–Se) toggles.
- **Density of states (`TDOS.dat`)** — plot the total DOS as an energy–DOS line chart.
- **Inverse participation ratio (`vasprun.xml`)** — compute the IPR of every electronic
  state and draw it as thin bars sharing the energy axis with the DOS (dual y-axis).

<p align="center">
  <img src="assets/electronic_density.png" alt="Charge density: 3D electron-cloud isosurface, density slice, and LED distribution" width="90%">
</p>

<p align="center">
  <img src="assets/electronic_elf.png" alt="ELFCAR: ELF isosurface and slice, ELF value distribution curve, and the bonding-path profile between an atom pair" width="90%">
</p>

<p align="center">
  <img src="assets/electronic_lobster.png" alt="LOBSTER bonding analysis: BWDF and per-element-pair -ICOHP / ICOOP scatter plots versus bond length" width="90%">
</p>

<p align="center">
  <img src="assets/electronic_dos_ipr.png" alt="Density of states and DOS + IPR dual-axis chart" width="90%">
</p>

## Acknowledgements

The crystal **visualization** foundation of this project — the Three.js/React renderer,
materials, color schemes, camera and orientation controls, element legend, and figure
export — comes from the original [pretty-lattice](https://github.com/songfeitong/pretty-lattice)
by [@songfeitong](https://github.com/songfeitong), released under the MIT License. All credit for
that work goes to the original author.

This fork extends it with:

- **Trajectory visualization** — load VASP `XDATCAR`, LAMMPS `.dump`, and `.xyz` trajectories
  and play through frames, reusing the same rendering and unified bond settings.
- **Structure analysis** — pair distribution g(r), coordination number, angular distribution,
  order parameters, MSD, and ALTBC, with interactive charts.
- **Electronic-property analysis** — CHGCAR charge density and ELFCAR electron localization
  as 3D isosurfaces plus slices and distributions, bonding-path profiles along an atom pair,
  LOBSTER BWDF/ICOHP/ICOOP bonding scatters, TDOS.dat density of states, and the inverse
  participation ratio (IPR) from vasprun.xml on a shared energy axis with the DOS.
- **Custom per-element-pair bond cutoffs** and a fix for periodic bonds across the cell boundary.

## License

Pretty Lattice is released under the [MIT License](LICENSE), inherited from the upstream project.

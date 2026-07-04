"""Electronic-property analysis: charge density, DOS and IPR.

Parsers and per-file computations for the electronic module:

* :mod:`pretty_lattice.electronic.chgcar` — VASP ``CHGCAR`` volumetric charge
  density: normalized grid, low-electron-density (LED) distribution and
  orthogonal slices for visualization.
* :mod:`pretty_lattice.electronic.dos` — ``TDOS.dat`` total density of states.
* :mod:`pretty_lattice.electronic.ipr` — inverse participation ratio from a
  VASP ``vasprun.xml`` (with the total DOS on a shared energy axis).
"""

from __future__ import annotations

from pretty_lattice.electronic.chgcar import (
    ChgcarData,
    ChgcarReadError,
    isosurface,
    led_distribution,
    parse_chgcar,
    slice_plane,
)
from pretty_lattice.electronic.dos import DosReadError, parse_tdos
from pretty_lattice.electronic.ipr import IprReadError, compute_ipr

__all__ = [
    "ChgcarData",
    "ChgcarReadError",
    "DosReadError",
    "IprReadError",
    "compute_ipr",
    "isosurface",
    "led_distribution",
    "parse_chgcar",
    "parse_tdos",
    "slice_plane",
]

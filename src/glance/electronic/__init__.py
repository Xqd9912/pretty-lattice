"""Electronic-property analysis: charge density, DOS and IPR.

Parsers and per-file computations for the electronic module:

* :mod:`glance.electronic.chgcar` — VASP volumetric grids
  (``CHGCAR``/``ELFCAR``): value grid, LED / value distributions, orthogonal
  slices, isosurfaces and bonding-path (cylinder) profiles.
* :mod:`glance.electronic.lobster` — LOBSTER bonding outputs: ``BWDF``
  curves and ``ICOHPLIST``/``ICOOPLIST`` per-pair populations.
* :mod:`glance.electronic.dos` — ``TDOS.dat`` total density of states.
* :mod:`glance.electronic.ipr` — inverse participation ratio from a
  VASP ``vasprun.xml`` (with the total DOS on a shared energy axis).
"""

from __future__ import annotations

from glance.electronic.chgcar import (
    ChgcarData,
    ChgcarReadError,
    atom_neighbors,
    isosurface,
    led_distribution,
    line_profile,
    parse_chgcar,
    parse_elfcar,
    slice_plane,
    value_histogram,
)
from glance.electronic.dos import DosReadError, parse_tdos
from glance.electronic.ipr import (
    IPR_AGGREGATION,
    IprData,
    IprReadError,
    IprState,
    aggregate_ipr_bands,
    compute_ipr,
    normalize_kpoint_weights,
)
from glance.electronic.lobster import (
    LobsterReadError,
    parse_bwdf,
    parse_pair_list,
)
from glance.electronic.vasprun import (
    MAX_SITE_PDOS_VALUES,
    Capability,
    DosSeries,
    VasprunData,
    VasprunReadError,
    aggregate_site_pdos,
    parse_vasprun,
)

__all__ = [
    "ChgcarData",
    "ChgcarReadError",
    "DosReadError",
    "IPR_AGGREGATION",
    "IprData",
    "IprReadError",
    "IprState",
    "LobsterReadError",
    "MAX_SITE_PDOS_VALUES",
    "Capability",
    "DosSeries",
    "VasprunData",
    "VasprunReadError",
    "atom_neighbors",
    "aggregate_ipr_bands",
    "compute_ipr",
    "isosurface",
    "led_distribution",
    "line_profile",
    "normalize_kpoint_weights",
    "parse_bwdf",
    "parse_chgcar",
    "parse_elfcar",
    "parse_pair_list",
    "parse_tdos",
    "parse_vasprun",
    "aggregate_site_pdos",
    "slice_plane",
    "value_histogram",
]

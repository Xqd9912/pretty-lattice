from __future__ import annotations

from math import dist

import pytest
from pymatgen.core import Lattice, Structure

from pretty_lattice.structures.periodic_images import canonicalize_fractional_position
from pretty_lattice.structures.scene import build_scene_response


def test_canonicalize_records_wrap_offset_for_sites_outside_unit_cell() -> None:
    position, image_offset, boundary_axes = canonicalize_fractional_position([-0.02, 1.3, 0.4])

    assert position[0] == pytest.approx(0.98)
    assert position[1] == pytest.approx(0.3)
    assert position[2] == pytest.approx(0.4)
    assert image_offset == (-1, 1, 0)
    assert boundary_axes == ()


def test_bonds_stay_local_when_sites_sit_just_outside_unit_cell() -> None:
    structure = Structure(
        Lattice.cubic(3.0),
        ["Na", "Cl"],
        [[-0.05, 0.5, 0.5], [0.15, 0.5, 0.5]],
        coords_are_cartesian=False,
        to_unit_cell=False,
    )

    scene = build_scene_response(structure, bond_algorithm="minimum-distance")
    atoms = scene["atoms"]
    bond_lengths = [
        dist(
            atoms[bond["startAtomIndex"]]["position"],
            atoms[bond["endAtomIndex"]]["position"],
        )
        for bond in scene["bonds"]
    ]

    # The two sites are 0.2 fractional units apart across the boundary (0.6 A).
    # Before canonicalization tracked the wrap offset, the bond rendered across
    # the whole cell (~2.4 A) instead of the short periodic contact.
    assert bond_lengths
    assert max(bond_lengths) == pytest.approx(0.6)

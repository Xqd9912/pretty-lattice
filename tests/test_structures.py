from pathlib import Path

import pytest
from ase import Atoms

from pretty_lattice.structures.colormaps import load_colormap
from pretty_lattice.structures.elements import load_element_registry
from pretty_lattice.structures.readers import (
    StructureReadError,
    read_structure,
    read_structure_bytes,
)
from pretty_lattice.structures.scene import build_scene_response

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "structures"


def test_read_cif_fixture() -> None:
    atoms = read_structure(FIXTURE_DIR / "trigonal_rhombohedral_al2o3.cif")

    assert len(atoms) == 5
    assert atoms.get_chemical_symbols() == ["Al", "Al", "O", "O", "O"]


def test_read_poscar_fixture_from_bytes() -> None:
    payload = (FIXTURE_DIR / "binary_nacl.poscar").read_bytes()

    atoms = read_structure_bytes(payload, filename="binary_nacl.poscar")

    assert len(atoms) == 2
    assert atoms.get_chemical_symbols() == ["Na", "Cl"]


def test_read_non_whitelisted_ase_format_from_bytes() -> None:
    atoms = read_structure_bytes(
        b"2\nwater\nH 0 0 0\nO 0 0 1\n",
        filename="water.xyz",
    )

    assert len(atoms) == 2
    assert atoms.get_chemical_symbols() == ["H", "O"]


def test_invalid_structure_bytes_raise_project_error() -> None:
    with pytest.raises(StructureReadError, match="Could not parse invalid.cif"):
        read_structure_bytes(b"not a structure", filename="invalid.cif")


def test_element_radius_and_colormap_resolution() -> None:
    element_registry = load_element_registry()
    colormap = load_colormap()

    oxygen = element_registry.resolve("O")

    assert oxygen.atomic_radius == pytest.approx(0.74)
    assert oxygen.vdw_radius == pytest.approx(1.52)
    assert oxygen.uniform_radius == pytest.approx(0.50)
    assert colormap.resolve("O") == "#ff0300"


def test_scene_response_shape_uses_radius_and_color_defaults() -> None:
    atoms = read_structure(FIXTURE_DIR / "binary_nacl.poscar")

    scene = build_scene_response(atoms)
    canonical_atoms = [atom for atom in scene["atoms"] if not atom["isPeriodicImage"]]

    assert scene["cell"]["vectors"][0] == [5.64, 0.0, 0.0]
    assert canonical_atoms[0] == {
        "id": "Na-0",
        "siteId": "Na-0",
        "element": "Na",
        "position": [0.0, 0.0, 0.0],
        "fractionalPosition": [0.0, 0.0, 0.0],
        "imageOffset": [0, 0, 0],
        "isPeriodicImage": False,
        "radius": pytest.approx(0.50),
        "color": "#fadd3d",
    }
    assert canonical_atoms[1]["element"] == "Cl"
    assert scene["summary"] == {
        "formula": "NaCl",
        "atomCount": 2,
        "cell": {
            "a": "5.64",
            "b": "5.64",
            "c": "5.64",
            "alpha": "90.0",
            "beta": "90.0",
            "gamma": "90.0",
        },
        "symmetry": {
            "available": True,
            "spaceGroup": "Pm-3m",
            "spaceGroupNumber": 221,
            "pointGroup": "m-3m",
            "pointGroupSchoenflies": "Oh",
            "crystalSystem": "cubic",
            "latticeSystem": "cubic",
        },
    }
    assert scene.keys() == {"cell", "atoms", "summary"}


@pytest.mark.parametrize(
    ("fractional_position", "expected_offsets"),
    [
        ([0.0, 0.5, 0.5], {(0, 0, 0), (1, 0, 0)}),
        ([0.0, 0.0, 0.5], {(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0)}),
        (
            [0.0, 0.0, 0.0],
            {
                (0, 0, 0),
                (0, 0, 1),
                (0, 1, 0),
                (0, 1, 1),
                (1, 0, 0),
                (1, 0, 1),
                (1, 1, 0),
                (1, 1, 1),
            },
        ),
    ],
)
def test_periodic_boundary_images_close_faces_edges_and_corners(
    fractional_position: list[float],
    expected_offsets: set[tuple[int, int, int]],
) -> None:
    atoms = Atoms(
        symbols=["He"],
        scaled_positions=[fractional_position],
        cell=[1.0, 1.0, 1.0],
        pbc=True,
    )

    scene = build_scene_response(atoms)

    assert {tuple(atom["imageOffset"]) for atom in scene["atoms"]} == expected_offsets
    assert {atom["siteId"] for atom in scene["atoms"]} == {"He-0"}
    assert sum(atom["isPeriodicImage"] for atom in scene["atoms"]) == len(expected_offsets) - 1
    assert scene["summary"]["atomCount"] == 1


def test_near_upper_boundary_canonicalizes_to_half_open_cell() -> None:
    atoms = Atoms(
        symbols=["He"],
        scaled_positions=[[1.0 - 1e-8, 0.5, 0.5]],
        cell=[1.0, 1.0, 1.0],
        pbc=True,
    )

    scene = build_scene_response(atoms)

    canonical_atom = next(atom for atom in scene["atoms"] if not atom["isPeriodicImage"])
    image_atom = next(atom for atom in scene["atoms"] if atom["isPeriodicImage"])

    assert canonical_atom["fractionalPosition"] == [0.0, 0.5, 0.5]
    assert canonical_atom["position"] == [0.0, 0.5, 0.5]
    assert image_atom["imageOffset"] == [1, 0, 0]
    assert image_atom["fractionalPosition"] == [1.0, 0.5, 0.5]
    assert image_atom["position"] == [1.0, 0.5, 0.5]


def test_non_periodic_structure_keeps_only_canonical_atom_instances() -> None:
    atoms = Atoms(
        symbols=["He"],
        positions=[[0.25, 0.25, 0.25]],
        cell=[1.0, 1.0, 1.0],
        pbc=False,
    )

    scene = build_scene_response(atoms)

    assert len(scene["atoms"]) == 1
    assert scene["atoms"][0]["siteId"] == "He-0"
    assert scene["atoms"][0]["imageOffset"] == [0, 0, 0]
    assert scene["atoms"][0]["isPeriodicImage"] is False
    assert scene["summary"]["atomCount"] == 1


def test_scene_summary_marks_non_periodic_symmetry_unavailable() -> None:
    atoms = read_structure_bytes(
        b"2\nwater\nH 0 0 0\nO 0 0 1\n",
        filename="water.xyz",
    )

    scene = build_scene_response(atoms)

    assert scene["summary"]["symmetry"] == {
        "available": False,
        "spaceGroup": None,
        "spaceGroupNumber": None,
        "pointGroup": None,
        "pointGroupSchoenflies": None,
        "crystalSystem": None,
        "latticeSystem": None,
    }

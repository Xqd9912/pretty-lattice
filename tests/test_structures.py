import ast
import tomllib
from pathlib import Path

import pytest
from pymatgen.core import Lattice, Structure

from pretty_lattice.structures.colormaps import load_colormap
from pretty_lattice.structures.elements import load_element_registry
from pretty_lattice.structures.readers import (
    StructureReadError,
    read_structure,
    read_structure_bytes,
)
from pretty_lattice.structures.scene import build_scene_response
from pretty_lattice.structures.symmetry import (
    POINT_GROUP_SCHOENFLIES,
    point_group_schoenflies_symbol,
)

PROJECT_ROOT = Path(__file__).parents[1]
FIXTURE_DIR = Path(__file__).parent / "fixtures" / "structures"
BACKEND_STRUCTURE_MODULES = [
    PROJECT_ROOT / "src" / "pretty_lattice" / "structures" / "readers.py",
    PROJECT_ROOT / "src" / "pretty_lattice" / "structures" / "scene.py",
    PROJECT_ROOT / "src" / "pretty_lattice" / "structures" / "symmetry.py",
]

CIF_FIXTURES = [
    ("Al2O3.cif", 30, {"Al", "O"}, "Al2O3", 167, "trigonal", "D3d"),
    (
        "Ba2Ca2Cu3HgO8.cif",
        16,
        {"Ba", "Ca", "Cu", "Hg", "O"},
        "Ba2Ca2Cu3HgO8",
        123,
        "tetragonal",
        "D4h",
    ),
    ("Hg3Cl4O.cif", 32, {"Hg", "Cl", "O"}, "Hg3Cl4O", 198, "cubic", "T"),
    ("MoS2.cif", 6, {"Mo", "S"}, "MoS2", 194, "hexagonal", "D6h"),
    ("NaCl.cif", 8, {"Na", "Cl"}, "NaCl", 225, "cubic", "Oh"),
    ("Si.cif", 8, {"Si"}, "Si", 227, "cubic", "Oh"),
    ("Sm(Mo3S4)2.cif", 45, {"Sm", "Mo", "S"}, "Sm(Mo3S4)2", 148, "trigonal", "C3i"),
    ("SrTiO3.cif", 5, {"Sr", "Ti", "O"}, "SrTiO3", 221, "cubic", "Oh"),
    ("TiO2.cif", 6, {"Ti", "O"}, "TiO2", 136, "tetragonal", "D4h"),
]


@pytest.mark.parametrize(
    (
        "filename",
        "atom_count",
        "elements",
        "formula",
        "space_group_number",
        "crystal_system",
        "point_group_schoenflies",
    ),
    CIF_FIXTURES,
)
def test_read_cif_fixtures(
    filename: str,
    atom_count: int,
    elements: set[str],
    formula: str,
    space_group_number: int,
    crystal_system: str,
    point_group_schoenflies: str,
) -> None:
    structure = read_structure(FIXTURE_DIR / filename)
    scene = build_scene_response(structure)

    assert isinstance(structure, Structure)
    assert len(structure) == atom_count
    assert {element.symbol for element in structure.composition.elements} == elements
    assert scene["summary"]["formula"] == formula
    assert scene["summary"]["atomCount"] == atom_count
    assert scene["summary"]["symmetry"]["spaceGroupNumber"] == space_group_number
    assert scene["summary"]["symmetry"]["crystalSystem"] == crystal_system
    assert scene["summary"]["symmetry"]["pointGroupSchoenflies"] == point_group_schoenflies


def test_read_cif_fixture_from_bytes() -> None:
    payload = (FIXTURE_DIR / "NaCl.cif").read_bytes()

    structure = read_structure_bytes(payload, filename="NaCl.cif")

    assert isinstance(structure, Structure)
    assert len(structure) == 8
    assert {element.symbol for element in structure.composition.elements} == {"Na", "Cl"}


def test_read_poscar_named_bytes_uses_pymatgen_filename_detection() -> None:
    payload = b"""NaCl
1.0
5.64 0 0
0 5.64 0
0 0 5.64
Na Cl
1 1
Direct
0 0 0
0.5 0.5 0.5
"""

    structure = read_structure_bytes(payload, filename="POSCAR")

    assert len(structure) == 2
    assert structure.composition.reduced_formula == "NaCl"


def test_invalid_structure_bytes_raise_project_error() -> None:
    with pytest.raises(StructureReadError, match="Could not parse invalid.cif"):
        read_structure_bytes(b"not a structure", filename="invalid.cif")


def test_project_runtime_dependencies_are_pymatgen_level() -> None:
    dependencies = tomllib.loads((PROJECT_ROOT / "pyproject.toml").read_text())["project"][
        "dependencies"
    ]
    dependency_names = {_dependency_name(dependency) for dependency in dependencies}

    assert "pymatgen" in dependency_names
    assert "ase" not in dependency_names
    assert "spglib" not in dependency_names


@pytest.mark.parametrize("module_path", BACKEND_STRUCTURE_MODULES)
def test_backend_structure_modules_avoid_direct_ase_and_spglib_imports(
    module_path: Path,
) -> None:
    imported_roots = _imported_roots(module_path.read_text())

    assert "ase" not in imported_roots
    assert "spglib" not in imported_roots


def test_point_group_schoenflies_mapping_covers_crystallographic_point_groups() -> None:
    assert len(POINT_GROUP_SCHOENFLIES) == 32
    assert point_group_schoenflies_symbol("m-3m") == "Oh"
    assert point_group_schoenflies_symbol("-3m") == "D3d"
    assert point_group_schoenflies_symbol("-42m") == "D2d"
    assert point_group_schoenflies_symbol("-6m2") == "D3h"
    assert point_group_schoenflies_symbol(None) is None
    assert point_group_schoenflies_symbol("not-a-point-group") is None


def test_element_radius_and_colormap_resolution() -> None:
    element_registry = load_element_registry()
    colormap = load_colormap()

    oxygen = element_registry.resolve("O")

    assert oxygen.atomic_radius == pytest.approx(0.74)
    assert oxygen.vdw_radius == pytest.approx(1.52)
    assert oxygen.uniform_radius == pytest.approx(0.50)
    assert colormap.resolve("O") == "#ff0300"


def test_scene_response_shape_uses_radius_and_color_defaults() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    scene = build_scene_response(structure)
    canonical_atoms = [atom for atom in scene["atoms"] if not atom["isPeriodicImage"]]
    periodic_image_atoms = [atom for atom in scene["atoms"] if atom["isPeriodicImage"]]

    assert scene["cell"]["vectors"][0] == [3.91270131, 0.0, 0.0]
    assert canonical_atoms[0] == {
        "id": "Sr-0",
        "siteId": "Sr-0",
        "element": "Sr",
        "position": [0.0, 0.0, 0.0],
        "fractionalPosition": [0.0, 0.0, 0.0],
        "imageOffset": [0, 0, 0],
        "isPeriodicImage": False,
        "radius": pytest.approx(0.50),
        "color": "#00ff27",
    }
    assert [atom["element"] for atom in canonical_atoms] == [
        "Sr",
        "Ti",
        "O",
        "O",
        "O",
    ]
    assert len(periodic_image_atoms) == 10
    assert scene["summary"] == {
        "formula": "SrTiO3",
        "atomCount": 5,
        "cell": {
            "a": "3.91",
            "b": "3.91",
            "c": "3.91",
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
    structure = _structure_from_fractional_positions(["C"], [fractional_position])

    scene = build_scene_response(structure)

    assert {tuple(atom["imageOffset"]) for atom in scene["atoms"]} == expected_offsets
    assert {atom["siteId"] for atom in scene["atoms"]} == {"C-0"}
    assert sum(atom["isPeriodicImage"] for atom in scene["atoms"]) == len(expected_offsets) - 1
    assert scene["summary"]["atomCount"] == 1


def test_near_upper_boundary_canonicalizes_to_half_open_cell() -> None:
    structure = _structure_from_fractional_positions(["C"], [[1.0 - 1e-8, 0.5, 0.5]])

    scene = build_scene_response(structure)

    canonical_atom = next(atom for atom in scene["atoms"] if not atom["isPeriodicImage"])
    image_atom = next(atom for atom in scene["atoms"] if atom["isPeriodicImage"])

    assert canonical_atom["fractionalPosition"] == [0.0, 0.5, 0.5]
    assert canonical_atom["position"] == [0.0, 0.5, 0.5]
    assert image_atom["imageOffset"] == [1, 0, 0]
    assert image_atom["fractionalPosition"] == [1.0, 0.5, 0.5]
    assert image_atom["position"] == [1.0, 0.5, 0.5]


def test_non_periodic_structure_keeps_only_canonical_atom_instances() -> None:
    structure = _structure_from_fractional_positions(
        ["C"],
        [[0.25, 0.25, 0.25]],
        pbc=False,
    )

    scene = build_scene_response(structure)

    assert len(scene["atoms"]) == 1
    assert scene["atoms"][0]["siteId"] == "C-0"
    assert scene["atoms"][0]["imageOffset"] == [0, 0, 0]
    assert scene["atoms"][0]["isPeriodicImage"] is False
    assert scene["summary"]["atomCount"] == 1


def test_scene_summary_marks_non_periodic_symmetry_unavailable() -> None:
    structure = Structure(
        Lattice.cubic(4.0, pbc=(False, False, False)),
        ["H", "O"],
        [[0.0, 0.0, 0.0], [0.0, 0.0, 1.0]],
        coords_are_cartesian=True,
    )

    scene = build_scene_response(structure)

    assert scene["summary"]["symmetry"] == {
        "available": False,
        "spaceGroup": None,
        "spaceGroupNumber": None,
        "pointGroup": None,
        "pointGroupSchoenflies": None,
        "crystalSystem": None,
        "latticeSystem": None,
    }


def _structure_from_fractional_positions(
    species: list[str],
    fractional_positions: list[list[float]],
    *,
    pbc: bool = True,
) -> Structure:
    return Structure(
        Lattice.cubic(1.0, pbc=(pbc, pbc, pbc)),
        species,
        fractional_positions,
        coords_are_cartesian=False,
        to_unit_cell=False,
    )


def _dependency_name(dependency: str) -> str:
    base_name = dependency.split("[", maxsplit=1)[0]
    for separator in (">", "<", "=", "~", "!"):
        base_name = base_name.split(separator, maxsplit=1)[0]
    return base_name.strip().lower()


def _imported_roots(source: str) -> set[str]:
    roots: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".", maxsplit=1)[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.split(".", maxsplit=1)[0])
    return roots

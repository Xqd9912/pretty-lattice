from __future__ import annotations

import math
from collections.abc import Sequence
from itertools import product
from typing import TypedDict

from pymatgen.core import Structure
from pymatgen.core.sites import PeriodicSite
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer

from pretty_lattice.structures.colormaps import Colormap, load_colormap
from pretty_lattice.structures.elements import ElementRegistry, load_element_registry
from pretty_lattice.structures.symmetry import point_group_schoenflies_symbol

_BOUNDARY_TOLERANCE = 1e-6
_CANONICAL_IMAGE_OFFSET = (0, 0, 0)
_FLOAT_ZERO_TOLERANCE = 1e-12


class CellSpec(TypedDict):
    vectors: list[list[float]]


class CellSummarySpec(TypedDict):
    a: str
    b: str
    c: str
    alpha: str
    beta: str
    gamma: str


class SymmetrySummarySpec(TypedDict):
    available: bool
    spaceGroup: str | None
    spaceGroupNumber: int | None
    pointGroup: str | None
    pointGroupSchoenflies: str | None
    crystalSystem: str | None
    latticeSystem: str | None


class StructureSummarySpec(TypedDict):
    formula: str
    atomCount: int
    cell: CellSummarySpec
    symmetry: SymmetrySummarySpec


class AtomSpec(TypedDict):
    id: str
    siteId: str
    element: str
    position: list[float]
    fractionalPosition: list[float]
    imageOffset: list[int]
    isPeriodicImage: bool
    radius: float
    color: str


class SceneSpec(TypedDict):
    cell: CellSpec
    atoms: list[AtomSpec]
    summary: StructureSummarySpec


def build_scene_response(
    structure: Structure,
    *,
    element_registry: ElementRegistry | None = None,
    colormap: Colormap | None = None,
) -> SceneSpec:
    elements = element_registry or load_element_registry()
    colors = colormap or load_colormap()
    cell_vectors = [_vector3(vector) for vector in structure.lattice.matrix]
    can_generate_periodic_images = _has_valid_3d_periodic_cell(structure)

    scene_atoms: list[AtomSpec] = []
    for index, site in enumerate(structure):
        symbol = _site_element_symbol(site)
        position = _vector3(site.coords)
        fractional_position = _vector3(site.frac_coords)
        element = elements.resolve(symbol)
        site_id = f"{element.symbol}-{index}"
        color = colors.resolve(element.symbol)

        if can_generate_periodic_images:
            canonical_fractional_position, boundary_axes = _canonicalize_fractional_position(
                fractional_position
            )
            for image_offset in _periodic_image_offsets(boundary_axes):
                scene_atoms.append(
                    _atom_instance(
                        cell_vectors=cell_vectors,
                        color=color,
                        element_symbol=element.symbol,
                        fractional_position=canonical_fractional_position,
                        image_offset=image_offset,
                        radius=element.uniform_radius,
                        site_id=site_id,
                    )
                )
            continue

        scene_atoms.append(
            _non_periodic_atom_instance(
                color=color,
                element_symbol=element.symbol,
                fractional_position=fractional_position,
                position=_vector3(position),
                radius=element.uniform_radius,
                site_id=site_id,
            )
        )

    return {
        "cell": {"vectors": cell_vectors},
        "atoms": scene_atoms,
        "summary": _build_structure_summary(structure),
    }


def _vector3(values: Sequence[float]) -> list[float]:
    return [_clean_float(values[0]), _clean_float(values[1]), _clean_float(values[2])]


def _clean_float(value: float) -> float:
    cleaned = float(value)
    if math.isclose(cleaned, 0.0, abs_tol=_FLOAT_ZERO_TOLERANCE):
        return 0.0
    return cleaned


def _site_element_symbol(site: PeriodicSite) -> str:
    try:
        specie = site.specie
    except AttributeError:
        specie = max(site.species.items(), key=lambda item: float(item[1]))[0]

    symbol = getattr(specie, "symbol", str(specie))
    return str(symbol)


def _atom_instance(
    *,
    cell_vectors: list[list[float]],
    color: str,
    element_symbol: str,
    fractional_position: list[float],
    image_offset: tuple[int, int, int],
    radius: float,
    site_id: str,
) -> AtomSpec:
    shifted_fractional_position = [
        fractional_position[axis] + image_offset[axis] for axis in range(3)
    ]
    return {
        "id": _atom_instance_id(site_id, image_offset),
        "siteId": site_id,
        "element": element_symbol,
        "position": _fractional_to_cartesian(shifted_fractional_position, cell_vectors),
        "fractionalPosition": shifted_fractional_position,
        "imageOffset": [int(value) for value in image_offset],
        "isPeriodicImage": image_offset != _CANONICAL_IMAGE_OFFSET,
        "radius": radius,
        "color": color,
    }


def _non_periodic_atom_instance(
    *,
    color: str,
    element_symbol: str,
    fractional_position: list[float],
    position: list[float],
    radius: float,
    site_id: str,
) -> AtomSpec:
    return {
        "id": site_id,
        "siteId": site_id,
        "element": element_symbol,
        "position": position,
        "fractionalPosition": fractional_position,
        "imageOffset": [0, 0, 0],
        "isPeriodicImage": False,
        "radius": radius,
        "color": color,
    }


def _atom_instance_id(site_id: str, image_offset: tuple[int, int, int]) -> str:
    if image_offset == _CANONICAL_IMAGE_OFFSET:
        return site_id
    return f"{site_id}-image-{image_offset[0]}-{image_offset[1]}-{image_offset[2]}"


def _canonicalize_fractional_position(
    fractional_position: Sequence[float],
) -> tuple[list[float], tuple[int, ...]]:
    canonical_position: list[float] = []
    boundary_axes: list[int] = []

    for axis, value in enumerate(fractional_position):
        wrapped_value = float(value) % 1.0
        if math.isclose(wrapped_value, 0.0, abs_tol=_BOUNDARY_TOLERANCE) or math.isclose(
            wrapped_value, 1.0, abs_tol=_BOUNDARY_TOLERANCE
        ):
            canonical_position.append(0.0)
            boundary_axes.append(axis)
            continue

        canonical_position.append(wrapped_value)

    return canonical_position, tuple(boundary_axes)


def _periodic_image_offsets(boundary_axes: tuple[int, ...]) -> list[tuple[int, int, int]]:
    if not boundary_axes:
        return [_CANONICAL_IMAGE_OFFSET]

    image_offsets: list[tuple[int, int, int]] = []
    for choices in product((0, 1), repeat=len(boundary_axes)):
        image_offset = [0, 0, 0]
        for axis, choice in zip(boundary_axes, choices, strict=True):
            image_offset[axis] = choice
        image_offsets.append((image_offset[0], image_offset[1], image_offset[2]))

    return image_offsets


def _fractional_to_cartesian(
    fractional_position: Sequence[float],
    cell_vectors: Sequence[Sequence[float]],
) -> list[float]:
    return [
        _clean_float(
            sum(fractional_position[axis] * cell_vectors[axis][component] for axis in range(3))
        )
        for component in range(3)
    ]


def _build_structure_summary(structure: Structure) -> StructureSummarySpec:
    a, b, c = (float(value) for value in structure.lattice.abc)
    alpha, beta, gamma = (float(value) for value in structure.lattice.angles)

    return {
        "formula": structure.composition.reduced_formula or "-",
        "atomCount": len(structure),
        "cell": {
            "a": _format_length(a),
            "b": _format_length(b),
            "c": _format_length(c),
            "alpha": _format_angle(alpha),
            "beta": _format_angle(beta),
            "gamma": _format_angle(gamma),
        },
        "symmetry": _build_symmetry_summary(structure),
    }


def _build_symmetry_summary(structure: Structure) -> SymmetrySummarySpec:
    if not _has_valid_3d_periodic_cell(structure):
        return _unavailable_symmetry_summary()

    try:
        analyzer = SpacegroupAnalyzer(structure, symprec=1e-5)
        number = int(analyzer.get_space_group_number())
        space_group = analyzer.get_space_group_symbol()
        point_group = analyzer.get_point_group_symbol()
        crystal_system = analyzer.get_crystal_system()
        lattice_system = analyzer.get_lattice_type()
    except Exception:
        return _unavailable_symmetry_summary()

    if not space_group:
        return _unavailable_symmetry_summary()

    return {
        "available": True,
        "spaceGroup": space_group,
        "spaceGroupNumber": number,
        "pointGroup": point_group or None,
        "pointGroupSchoenflies": point_group_schoenflies_symbol(point_group),
        "crystalSystem": crystal_system,
        "latticeSystem": lattice_system,
    }


def _has_valid_3d_periodic_cell(structure: Structure) -> bool:
    return _has_valid_3d_cell(structure) and all(bool(periodic) for periodic in structure.pbc)


def _has_valid_3d_cell(structure: Structure) -> bool:
    return (
        len(structure) > 0
        and math.isfinite(float(structure.lattice.volume))
        and not math.isclose(float(structure.lattice.volume), 0.0, abs_tol=1e-12)
    )


def _unavailable_symmetry_summary() -> SymmetrySummarySpec:
    return {
        "available": False,
        "spaceGroup": None,
        "spaceGroupNumber": None,
        "pointGroup": None,
        "pointGroupSchoenflies": None,
        "crystalSystem": None,
        "latticeSystem": None,
    }


def _format_length(value: float) -> str:
    return _format_number(value, precision=2)


def _format_angle(value: float) -> str:
    return _format_number(value, precision=1)


def _format_number(value: float, *, precision: int) -> str:
    if not math.isfinite(value):
        return "-"
    return f"{value:.{precision}f}"

from __future__ import annotations

from pymatgen.core import Structure

import glance.structures.connectivity as connectivity_module
import glance.structures.polyhedra as polyhedra_module
from glance.structures.bond_cutoffs import (
    cutoff_lookup_from_specs,
    default_bond_cutoffs_for_structure,
)
from glance.structures.periodic_images import (
    atom_record_to_spec,
    build_atom_records,
    vector3,
)
from glance.structures.schema import (
    BondAlgorithm,
    BondCutoffSpec,
    SceneSpec,
    bond_algorithm_label,
    default_bond_algorithm_for_atom_count,
    normalize_bond_algorithm,
)
from glance.structures.summary import (
    build_structure_summary,
    has_valid_3d_periodic_cell,
)


def build_scene_response(
    structure: Structure,
    *,
    bond_algorithm: str | None = None,
    bond_cutoffs: list[BondCutoffSpec] | None = None,
) -> SceneSpec:
    return build_scene_spec(
        structure,
        bond_algorithm=bond_algorithm,
        bond_cutoffs=bond_cutoffs,
    )


def build_scene_spec(
    structure: Structure,
    *,
    bond_algorithm: str | None = None,
    bond_cutoffs: list[BondCutoffSpec] | None = None,
) -> SceneSpec:
    normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    selected_bond_algorithm = normalized_bond_algorithm or default_bond_algorithm_for_atom_count(
        len(structure)
    )
    cell_vectors = [vector3(vector) for vector in structure.lattice.matrix]
    can_generate_periodic_images = has_valid_3d_periodic_cell(structure)
    bond_cutoff_defaults = default_bond_cutoffs_for_structure(structure)
    cutoff_lookup = _cutoff_lookup_for_algorithm(
        selected_bond_algorithm,
        bond_cutoffs=bond_cutoffs,
        bond_cutoff_defaults=bond_cutoff_defaults,
    )
    atom_data = build_atom_records(
        structure,
        can_generate_periodic_images=can_generate_periodic_images,
    )

    bonds = []
    polyhedra = []
    warnings = []
    if can_generate_periodic_images:
        boundary_source_keys = [
            key
            for key, atom in atom_data.atom_records.items()
            if "boundary" in atom.image_reasons
        ]
        try:
            connectivity = connectivity_module.build_connectivity(
                atom_records=atom_data.atom_records,
                bond_algorithm=selected_bond_algorithm,
                canonical_source_keys=atom_data.canonical_source_keys,
                boundary_source_keys=boundary_source_keys,
                sites=atom_data.sites,
                structure=structure,
                bond_cutoffs=cutoff_lookup,
            )
        except Exception as exc:
            warnings.append(
                _analysis_warning(
                    code="bond-analysis-failed",
                    analysis="Bond analysis",
                    bond_algorithm=selected_bond_algorithm,
                    exc=exc,
                )
            )
        else:
            atom_index_by_key = {
                key: index for index, key in enumerate(atom_data.atom_records.keys())
            }
            try:
                bonds = connectivity_module.build_bonds(
                    atom_index_by_key=atom_index_by_key,
                    connectivity=connectivity,
                )
            except Exception as exc:
                warnings.append(
                    _analysis_warning(
                        code="bond-analysis-failed",
                        analysis="Bond analysis",
                        bond_algorithm=selected_bond_algorithm,
                        exc=exc,
                    )
                )

            try:
                polyhedra = polyhedra_module.build_polyhedra(
                    atom_index_by_key=atom_index_by_key,
                    atom_records=atom_data.atom_records,
                    cell_vectors=cell_vectors,
                    connectivity=connectivity,
                    structure=structure,
                )
            except Exception as exc:
                warnings.append(
                    _analysis_warning(
                        code="polyhedra-analysis-failed",
                        analysis="Polyhedra analysis",
                        bond_algorithm=selected_bond_algorithm,
                        exc=exc,
                    )
                )

    scene: SceneSpec = {
        "cell": {
            "periodic": can_generate_periodic_images,
            "vectors": cell_vectors,
        },
        "atoms": [
            atom_record_to_spec(atom, cell_vectors) for atom in atom_data.atom_records.values()
        ],
        "bonds": bonds,
        "polyhedra": polyhedra,
        "summary": build_structure_summary(structure),
        "bondCutoffs": bond_cutoff_defaults,
    }
    if warnings:
        scene["warnings"] = warnings

    return scene


def _cutoff_lookup_for_algorithm(
    bond_algorithm: BondAlgorithm,
    *,
    bond_cutoffs: list[BondCutoffSpec] | None,
    bond_cutoff_defaults: list[BondCutoffSpec],
) -> dict[tuple[str, str], float] | None:
    if bond_algorithm != "custom-cutoff":
        return None

    specs = bond_cutoffs if bond_cutoffs is not None else bond_cutoff_defaults
    return cutoff_lookup_from_specs(specs)


def _analysis_warning(
    *,
    code: str,
    analysis: str,
    bond_algorithm: BondAlgorithm,
    exc: Exception,
) -> dict[str, str]:
    return {
        "code": code,
        "message": f"{analysis} with {bond_algorithm_label(bond_algorithm)} failed: {exc}",
    }

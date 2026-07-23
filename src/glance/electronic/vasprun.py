"""Capability-based DOS, projected DOS and IPR parsing for ``vasprun.xml``."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np

from glance.electronic import ipr as ipr_module
from glance.electronic.ipr import IPR_AGGREGATION, IprReadError, IprState

MAX_SITE_PDOS_VALUES = 20_000_000
_ORBITAL_ORDER = ("s", "p", "d", "f")


class VasprunReadError(ValueError):
    """Raised when a vasprun payload cannot provide any usable data."""


@dataclass(frozen=True)
class Capability:
    available: bool
    reason: str | None = None

    def response(self) -> dict[str, object]:
        result: dict[str, object] = {"available": self.available}
        if self.reason:
            result["reason"] = self.reason
        return result


@dataclass(frozen=True)
class DosSeries:
    id: str
    label: str
    kind: str
    spin: str
    values: np.ndarray
    element: str | None = None
    orbital: str | None = None

    def __post_init__(self) -> None:
        values = np.asarray(self.values, dtype=np.float32)
        values.setflags(write=False)
        object.__setattr__(self, "values", values)

    def response(self) -> dict[str, object]:
        result: dict[str, object] = {
            "id": self.id,
            "label": self.label,
            "kind": self.kind,
            "spin": self.spin,
            "values": self.values.tolist(),
        }
        if self.element is not None:
            result["element"] = self.element
        if self.orbital is not None:
            result["orbital"] = self.orbital
        return result


@dataclass(frozen=True)
class VasprunData:
    efermi: float
    structure: object
    elements: tuple[str, ...]
    energy: np.ndarray
    dos_series: tuple[DosSeries, ...]
    pdos_series: tuple[DosSeries, ...]
    orbital_types: tuple[str, ...]
    spin_channels: tuple[str, ...]
    site_spin_channels: tuple[str, ...]
    site_pdos: np.ndarray | None
    ipr_states: tuple[IprState, ...]
    ipr_compositions: np.ndarray | None
    capabilities: dict[str, Capability]
    warnings: tuple[str, ...]

    def __post_init__(self) -> None:
        energy = np.asarray(self.energy, dtype=np.float32)
        energy.setflags(write=False)
        object.__setattr__(self, "energy", energy)
        if self.site_pdos is not None:
            self.site_pdos.setflags(write=False)
        if self.ipr_compositions is not None:
            self.ipr_compositions.setflags(write=False)


def parse_vasprun(payload: bytes) -> VasprunData:
    """Parse a vasprun once and retain every independently available capability."""
    if not payload:
        raise VasprunReadError("Uploaded vasprun.xml file is empty.")

    try:
        vasprun = ipr_module._parse_vasprun(payload)
    except IprReadError as exc:
        raise VasprunReadError(str(exc)) from exc

    structure = getattr(vasprun, "final_structure", None)
    if structure is None or len(structure) == 0:
        raise VasprunReadError("vasprun.xml has no final structure.")

    try:
        efermi = ipr_module._finite_float(
            getattr(vasprun, "efermi", 0.0) or 0.0, "Fermi energy"
        )
        elements = tuple(ipr_module._site_element(site) for site in structure)
    except IprReadError as exc:
        raise VasprunReadError(str(exc)) from exc

    energy, dos_series, dos_reason = _extract_total_dos(vasprun, efermi)
    pdos_series, orbital_types, pdos_reason = _extract_aggregate_pdos(
        vasprun, energy, efermi, elements
    )
    site_pdos, site_spin_channels, site_reason = _extract_site_pdos(
        vasprun,
        energy,
        orbital_types,
        structure,
    )
    ipr_states, ipr_compositions, ipr_warnings, ipr_reason = _extract_ipr(
        vasprun, efermi, len(elements)
    )

    spin_channels = _ordered_spins(
        [series.spin for series in (*dos_series, *pdos_series)] + list(site_spin_channels)
    )
    capabilities = {
        "dos": Capability(bool(dos_series), dos_reason),
        "pdos": Capability(bool(pdos_series), pdos_reason),
        "sitePdos": Capability(site_pdos is not None, site_reason),
        "ipr": Capability(bool(ipr_states), ipr_reason),
    }
    if not any(capability.available for capability in capabilities.values()):
        reasons = [
            capability.reason
            for capability in capabilities.values()
            if capability.reason is not None
        ]
        detail = reasons[0] if reasons else "No DOS, PDOS or IPR data was found."
        raise VasprunReadError(detail)

    warnings = list(ipr_warnings)
    for name, capability in capabilities.items():
        if not capability.available and capability.reason:
            warnings.append(f"{_capability_label(name)} unavailable: {capability.reason}")

    return VasprunData(
        efermi=efermi,
        structure=structure,
        elements=elements,
        energy=energy,
        dos_series=dos_series,
        pdos_series=pdos_series,
        orbital_types=orbital_types,
        spin_channels=spin_channels,
        site_spin_channels=site_spin_channels,
        site_pdos=site_pdos,
        ipr_states=ipr_states,
        ipr_compositions=ipr_compositions,
        capabilities=capabilities,
        warnings=tuple(dict.fromkeys(warnings)),
    )


def aggregate_site_pdos(
    data: VasprunData,
    site_indices: Sequence[int],
) -> dict[str, object]:
    """Sum the selected canonical sites into total and s/p/d/f series."""
    if data.site_pdos is None:
        reason = data.capabilities["sitePdos"].reason or "Site PDOS is unavailable."
        raise VasprunReadError(reason)

    unique = tuple(sorted(set(site_indices)))
    if not unique:
        raise VasprunReadError("Select at least one atom for site PDOS.")
    if unique[0] < 0 or unique[-1] >= len(data.elements):
        raise VasprunReadError("A selected atom index is outside the vasprun structure.")

    selected = data.site_pdos[np.asarray(unique, dtype=np.int64)]
    # [site, orbital, spin, energy] -> [orbital, spin, energy]
    orbital_sum = np.sum(selected, axis=0, dtype=np.float64)
    total = np.sum(orbital_sum, axis=0, dtype=np.float64)
    series: list[dict[str, object]] = []
    for spin_index, spin in enumerate(data.site_spin_channels):
        series.append(
            {
                "id": f"selected:total:{spin}",
                "label": _spin_label_text("Selected total", spin),
                "kind": "site-group",
                "orbital": "total",
                "spin": spin,
                "values": total[spin_index].astype(np.float32).tolist(),
            }
        )
        for orbital_index, orbital in enumerate(data.orbital_types):
            series.append(
                {
                    "id": f"selected:{orbital}:{spin}",
                    "label": _spin_label_text(f"Selected {orbital}", spin),
                    "kind": "site-group",
                    "orbital": orbital,
                    "spin": spin,
                    "values": orbital_sum[orbital_index, spin_index]
                    .astype(np.float32)
                    .tolist(),
                }
            )
    return {
        "siteIndices": list(unique),
        "atomCount": len(unique),
        "series": series,
    }


def _extract_total_dos(
    vasprun: object, efermi: float
) -> tuple[np.ndarray, tuple[DosSeries, ...], str | None]:
    tdos = getattr(vasprun, "tdos", None)
    if tdos is None:
        energy = _fallback_energy(vasprun, efermi)
        return energy, (), "vasprun.xml has no total density of states."
    try:
        energy = _dos_energy(tdos, efermi)
        series = _dos_object_series(tdos, energy, kind="tdos", label="TDOS")
    except VasprunReadError as exc:
        return _fallback_energy(vasprun, efermi), (), str(exc)
    if not series:
        return energy, (), "vasprun.xml has no total DOS density channels."
    return energy, series, None


def _extract_aggregate_pdos(
    vasprun: object,
    energy: np.ndarray,
    efermi: float,
    elements: tuple[str, ...],
) -> tuple[tuple[DosSeries, ...], tuple[str, ...], str | None]:
    complete = getattr(vasprun, "complete_dos", None)
    if complete is None:
        return (), (), "vasprun.xml has no projected density of states."
    if energy.size == 0:
        try:
            energy = _dos_energy(complete, efermi)
        except VasprunReadError as exc:
            return (), (), str(exc)

    result: list[DosSeries] = []
    orbital_types: set[str] = set()
    try:
        element_dos = complete.get_element_dos()
        for element in _unique_in_order(elements):
            dos = _mapping_value_by_label(element_dos, element)
            if dos is not None:
                result.extend(
                    _dos_object_series(
                        dos,
                        energy,
                        kind="element",
                        label=element,
                        element=element,
                    )
                )

        spd_dos = complete.get_spd_dos()
        for orbital_key, dos in spd_dos.items():
            orbital = _orbital_label(orbital_key)
            orbital_types.add(orbital)
            result.extend(
                _dos_object_series(
                    dos,
                    energy,
                    kind="orbital",
                    label=orbital,
                    orbital=orbital,
                )
            )

        for element in _unique_in_order(elements):
            element_key = _mapping_key_by_label(element_dos, element)
            if element_key is None:
                continue
            element_spd = complete.get_element_spd_dos(element_key)
            for orbital_key, dos in element_spd.items():
                orbital = _orbital_label(orbital_key)
                orbital_types.add(orbital)
                result.extend(
                    _dos_object_series(
                        dos,
                        energy,
                        kind="element-orbital",
                        label=f"{element} {orbital}",
                        element=element,
                        orbital=orbital,
                    )
                )
    except (AttributeError, KeyError, TypeError, ValueError, VasprunReadError) as exc:
        return (), (), f"Could not read projected DOS: {exc}"

    if not result:
        return (), (), "vasprun.xml has no projected density channels."
    return tuple(result), _ordered_orbitals(orbital_types), None


def _extract_site_pdos(
    vasprun: object,
    energy: np.ndarray,
    orbital_types: tuple[str, ...],
    structure: object,
) -> tuple[np.ndarray | None, tuple[str, ...], str | None]:
    complete = getattr(vasprun, "complete_dos", None)
    if complete is None or not orbital_types or energy.size == 0:
        return None, (), "vasprun.xml has no atom-resolved projected DOS."

    try:
        site_maps = [complete.get_site_spd_dos(site) for site in structure]
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        return None, (), f"Could not read atom-resolved projected DOS: {exc}"
    if not site_maps or any(not site_map for site_map in site_maps):
        return None, (), "vasprun.xml has incomplete atom-resolved projected DOS."

    spins = _ordered_spins(
        _spin_label(spin)
        for site_map in site_maps
        for dos in site_map.values()
        for spin in (getattr(dos, "densities", {}) or {}).keys()
    )
    if not spins:
        return None, (), "vasprun.xml has no atom-resolved PDOS density channels."
    value_count = len(site_maps) * len(orbital_types) * len(spins) * energy.size
    if value_count > MAX_SITE_PDOS_VALUES:
        return (
            None,
            spins,
            "Atom-resolved PDOS is too large to keep in memory "
            f"({value_count} values; limit {MAX_SITE_PDOS_VALUES}).",
        )

    values = np.zeros(
        (len(site_maps), len(orbital_types), len(spins), energy.size),
        dtype=np.float32,
    )
    orbital_index = {orbital: index for index, orbital in enumerate(orbital_types)}
    spin_index = {spin: index for index, spin in enumerate(spins)}
    try:
        for site_index, site_map in enumerate(site_maps):
            for orbital_key, dos in site_map.items():
                orbital = _orbital_label(orbital_key)
                if orbital not in orbital_index:
                    continue
                for spin_key, density in (getattr(dos, "densities", {}) or {}).items():
                    spin = _spin_label(spin_key)
                    array = _density_array(density, energy.size)
                    values[site_index, orbital_index[orbital], spin_index[spin]] = array
    except (KeyError, VasprunReadError) as exc:
        return None, spins, str(exc)
    return values, spins, None


def _extract_ipr(
    vasprun: object,
    efermi: float,
    atom_count: int,
) -> tuple[tuple[IprState, ...], np.ndarray | None, tuple[str, ...], str | None]:
    try:
        ipr_module._validate_calculation_mode(vasprun)
        projected_by_spin = getattr(vasprun, "projected_eigenvalues", None)
        eigenvalues_by_spin = getattr(vasprun, "eigenvalues", None)
        if not isinstance(projected_by_spin, Mapping) or not projected_by_spin:
            raise IprReadError(
                "vasprun.xml has no projected eigenvalues; rerun VASP with LORBIT >= 11."
            )
        if len(projected_by_spin) != 1:
            raise IprReadError("IPR atom contributions support exactly one spin channel.")
        if not isinstance(eigenvalues_by_spin, Mapping):
            raise IprReadError("vasprun.xml has no band eigenvalues for IPR analysis.")
        spin = next(iter(projected_by_spin))
        if spin not in eigenvalues_by_spin:
            raise IprReadError(
                "Projected eigenvalues do not match the available band eigenvalues."
            )
        states, compositions, warnings = ipr_module.aggregate_ipr_bands(
            projected=projected_by_spin[spin],
            eigenvalues=eigenvalues_by_spin[spin],
            kpoint_weights=getattr(vasprun, "actual_kpoints_weights", None),
            efermi=efermi,
            atom_count=atom_count,
        )
    except IprReadError as exc:
        return (), None, (), str(exc)
    return states, compositions, warnings, None


def _dos_energy(dos: object, efermi: float) -> np.ndarray:
    try:
        energy = np.asarray(getattr(dos, "energies", None), dtype=np.float64) - efermi
    except (TypeError, ValueError) as exc:
        raise VasprunReadError("DOS energies must be numeric.") from exc
    if energy.ndim != 1 or energy.size == 0 or not np.all(np.isfinite(energy)):
        raise VasprunReadError("DOS energies must be a finite one-dimensional array.")
    return energy.astype(np.float32)


def _fallback_energy(vasprun: object, efermi: float) -> np.ndarray:
    complete = getattr(vasprun, "complete_dos", None)
    if complete is None:
        return np.asarray([], dtype=np.float32)
    try:
        return _dos_energy(complete, efermi)
    except VasprunReadError:
        return np.asarray([], dtype=np.float32)


def _dos_object_series(
    dos: object,
    energy: np.ndarray,
    *,
    kind: str,
    label: str,
    element: str | None = None,
    orbital: str | None = None,
) -> tuple[DosSeries, ...]:
    densities = getattr(dos, "densities", None)
    if not isinstance(densities, Mapping):
        return ()
    result: list[DosSeries] = []
    rows = sorted(densities.items(), key=lambda item: _spin_sort_key(_spin_label(item[0])))
    for spin_key, density in rows:
        spin = _spin_label(spin_key)
        values = _density_array(density, energy.size)
        parts = [kind]
        if element:
            parts.append(element)
        if orbital:
            parts.append(orbital)
        parts.append(spin)
        result.append(
            DosSeries(
                id=":".join(parts),
                label=_spin_label_text(label, spin),
                kind=kind,
                spin=spin,
                values=values,
                element=element,
                orbital=orbital,
            )
        )
    return tuple(result)


def _density_array(value: object, expected_size: int) -> np.ndarray:
    try:
        result = np.asarray(value, dtype=np.float32)
    except (TypeError, ValueError) as exc:
        raise VasprunReadError("DOS densities must be numeric.") from exc
    if result.shape != (expected_size,) or not np.all(np.isfinite(result)):
        raise VasprunReadError("DOS energies and densities have different lengths.")
    return result


def _spin_label(spin: object) -> str:
    value = getattr(spin, "value", spin)
    try:
        return "down" if int(value) < 0 else "up"
    except (TypeError, ValueError):
        return "down" if "down" in str(spin).lower() else "up"


def _spin_label_text(label: str, spin: str) -> str:
    return f"{label} ({spin})"


def _spin_sort_key(spin: str) -> int:
    return 1 if spin == "down" else 0


def _ordered_spins(spins: Sequence[str] | object) -> tuple[str, ...]:
    unique = set(spins)
    return tuple(sorted(unique, key=_spin_sort_key))


def _orbital_label(orbital: object) -> str:
    name = str(getattr(orbital, "name", orbital)).lower()
    for label in _ORBITAL_ORDER:
        if name == label or name.startswith(label):
            return label
    return name


def _ordered_orbitals(orbitals: Sequence[str] | set[str]) -> tuple[str, ...]:
    order = {label: index for index, label in enumerate(_ORBITAL_ORDER)}
    return tuple(sorted(set(orbitals), key=lambda value: (order.get(value, 99), value)))


def _unique_in_order(values: Sequence[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def _mapping_key_by_label(mapping: Mapping[object, object], label: str) -> object | None:
    for key in mapping:
        key_label = str(getattr(key, "symbol", key))
        if key_label == label:
            return key
    return None


def _mapping_value_by_label(mapping: Mapping[object, object], label: str) -> object | None:
    key = _mapping_key_by_label(mapping, label)
    return None if key is None else mapping[key]


def _capability_label(name: str) -> str:
    return {"dos": "DOS", "pdos": "PDOS", "sitePdos": "Site PDOS", "ipr": "IPR"}[name]


__all__ = [
    "IPR_AGGREGATION",
    "MAX_SITE_PDOS_VALUES",
    "Capability",
    "DosSeries",
    "VasprunData",
    "VasprunReadError",
    "aggregate_site_pdos",
    "parse_vasprun",
]

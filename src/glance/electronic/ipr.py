"""Atom-resolved, k-weighted IPR analysis from VASP ``vasprun.xml``.

Glance treats one band as one state.  For every positive-weight k-point, the
projected orbital weights are first normalized across ions.  Those atomic
compositions are then averaged with the normalized k-point weights.  The
reported aggregate IPR is the squared norm of that band composition, so the
per-atom contributions returned by the API sum to exactly the displayed IPR.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from pymatgen.core import Structure

MAX_IPR_STATES = 20_000
MAX_IPR_COMPOSITION_VALUES = 20_000_000
_PROJECTION_EPSILON = 1e-12
_NEGATIVE_PROJECTION_TOLERANCE = 1e-8
IPR_AGGREGATION = "k-weighted-band-composition"


class IprReadError(ValueError):
    """Raised when a vasprun.xml payload cannot be analyzed reliably."""


@dataclass(frozen=True)
class IprState:
    """Metadata for one k-weighted band."""

    state_id: str
    band_index: int
    energy: float
    energy_min: float
    energy_max: float
    occupation: float
    ipr: float
    k_point_count: int

    def response(self) -> dict[str, object]:
        return {
            "stateId": self.state_id,
            "bandIndex": self.band_index,
            "energy": self.energy,
            "energyMin": self.energy_min,
            "energyMax": self.energy_max,
            "occupation": self.occupation,
            "ipr": self.ipr,
            "kPointCount": self.k_point_count,
        }


@dataclass(frozen=True)
class IprData:
    """Parsed data retained by the server-side IPR LRU store."""

    efermi: float
    dos: dict[str, list[float]]
    structure: Structure
    states: tuple[IprState, ...]
    compositions: np.ndarray
    elements: tuple[str, ...]
    warnings: tuple[str, ...]

    def __post_init__(self) -> None:
        if self.compositions.shape != (len(self.states), len(self.elements)):
            raise ValueError("IPR state metadata and composition matrix are inconsistent.")
        self.compositions.setflags(write=False)


def compute_ipr(payload: bytes) -> IprData:
    """Parse ``vasprun.xml`` once and compute atom-resolved band aggregates."""
    if not payload:
        raise IprReadError("Uploaded vasprun.xml file is empty.")

    vasprun = _parse_vasprun(payload)
    _validate_calculation_mode(vasprun)

    projected_by_spin = getattr(vasprun, "projected_eigenvalues", None)
    eigenvalues_by_spin = getattr(vasprun, "eigenvalues", None)
    if not projected_by_spin:
        raise IprReadError(
            "vasprun.xml has no projected eigenvalues; rerun VASP with LORBIT >= 11 for IPR."
        )
    if not isinstance(projected_by_spin, Mapping) or len(projected_by_spin) != 1:
        raise IprReadError("IPR analysis currently supports exactly one spin channel (ISPIN = 1).")
    if not isinstance(eigenvalues_by_spin, Mapping):
        raise IprReadError("vasprun.xml has no band eigenvalues for IPR analysis.")

    spin = next(iter(projected_by_spin))
    if spin not in eigenvalues_by_spin:
        raise IprReadError("Projected eigenvalues do not match the available band eigenvalues.")

    structure = getattr(vasprun, "final_structure", None)
    if structure is None or len(structure) == 0:
        raise IprReadError("vasprun.xml has no final structure for atom-resolved IPR.")

    efermi = _finite_float(getattr(vasprun, "efermi", 0.0) or 0.0, "Fermi energy")
    elements = tuple(_site_element(site) for site in structure)
    states, compositions, warnings = aggregate_ipr_bands(
        projected=projected_by_spin[spin],
        eigenvalues=eigenvalues_by_spin[spin],
        kpoint_weights=getattr(vasprun, "actual_kpoints_weights", None),
        efermi=efermi,
        atom_count=len(structure),
    )
    return IprData(
        efermi=efermi,
        dos=_total_dos(vasprun, efermi),
        structure=structure,
        states=states,
        compositions=compositions,
        elements=elements,
        warnings=warnings,
    )


def aggregate_ipr_bands(
    *,
    projected: object,
    eigenvalues: object,
    kpoint_weights: Sequence[float] | np.ndarray | None,
    efermi: float,
    atom_count: int,
) -> tuple[tuple[IprState, ...], np.ndarray, tuple[str, ...]]:
    """Aggregate synthetic or parsed projection arrays into per-band IPR states.

    ``projected`` must have shape ``[nk, nband, nion, norb]`` and
    ``eigenvalues`` shape ``[nk, nband, >=2]`` (energy, occupation).  This
    function is intentionally independent of ``Vasprun`` so its scientific
    semantics can be tested with small deterministic arrays.
    """
    projection = _numeric_array(projected, "Projected eigenvalues")
    eigen = _numeric_array(eigenvalues, "Band eigenvalues")
    if projection.ndim != 4:
        raise IprReadError(
            "Projected eigenvalues must have shape [k-point, band, ion, orbital]."
        )
    if eigen.ndim != 3 or eigen.shape[2] < 2:
        raise IprReadError(
            "Band eigenvalues must have shape [k-point, band, energy/occupation]."
        )

    nk, band_count, nion, orbital_count = projection.shape
    if nk == 0 or band_count == 0 or nion == 0 or orbital_count == 0:
        raise IprReadError("Projected eigenvalues contain an empty dimension.")
    if eigen.shape[:2] != (nk, band_count):
        raise IprReadError("Projected eigenvalues and band eigenvalues have different shapes.")
    if nion != atom_count:
        raise IprReadError(
            f"Projected ion count ({nion}) does not match the final structure ({atom_count})."
        )
    if band_count > MAX_IPR_STATES:
        raise IprReadError(
            f"vasprun.xml has {band_count} bands; at most {MAX_IPR_STATES} can be visualized."
        )
    value_count = band_count * nion
    if value_count > MAX_IPR_COMPOSITION_VALUES:
        raise IprReadError(
            "Atom-resolved IPR data is too large to keep in memory "
            f"({value_count} band-atom values; limit {MAX_IPR_COMPOSITION_VALUES})."
        )

    minimum_projection = float(projection.min())
    if minimum_projection < -_NEGATIVE_PROJECTION_TOLERANCE:
        raise IprReadError(
            "Projected eigenvalues contain materially negative orbital weights "
            f"(minimum {minimum_projection:.3g})."
        )
    # Small negative values can arise from formatted floating-point output.
    projection = np.maximum(projection, 0.0)

    normalized_k_weights, positive_k = normalize_kpoint_weights(kpoint_weights, nk)
    active_projection = projection[positive_k]
    active_eigen = eigen[positive_k]
    active_q = normalized_k_weights[positive_k]
    atom_weights = active_projection.sum(axis=3)  # [active k, band, ion]
    denominators = atom_weights.sum(axis=2)  # [active k, band]

    state_rows: list[tuple[IprState, np.ndarray]] = []
    skipped_bands: list[int] = []
    for band_index in range(band_count):
        # Every positive-weight k-point needs a meaningful atomic distribution.
        # Otherwise p[k,i] is undefined and silently renormalizing q would change
        # the documented band aggregation.
        band_denominators = denominators[:, band_index]
        if np.any(band_denominators <= _PROJECTION_EPSILON):
            skipped_bands.append(band_index)
            continue

        per_k = atom_weights[:, band_index, :] / band_denominators[:, None]
        composition64 = np.sum(active_q[:, None] * per_k, axis=0)
        composition_total = float(composition64.sum())
        if not np.isfinite(composition_total) or composition_total <= _PROJECTION_EPSILON:
            skipped_bands.append(band_index)
            continue
        # Remove accumulated round-off before float32 storage.
        composition64 = composition64 / composition_total
        composition = np.asarray(composition64, dtype=np.float32)
        stored_total = float(np.sum(composition, dtype=np.float64))
        composition = np.asarray(composition / stored_total, dtype=np.float32)

        band_energies = active_eigen[:, band_index, 0] - efermi
        occupations = active_eigen[:, band_index, 1]
        ipr = float(np.sum(composition.astype(np.float64) ** 2))
        state = IprState(
            state_id=f"band-{band_index}",
            band_index=band_index,
            energy=float(np.dot(active_q, band_energies)),
            energy_min=float(band_energies.min()),
            energy_max=float(band_energies.max()),
            occupation=float(np.dot(active_q, occupations)),
            ipr=ipr,
            k_point_count=int(active_q.size),
        )
        state_rows.append((state, composition))

    if not state_rows:
        raise IprReadError("No bands contain valid projected weight at every used k-point.")

    state_rows.sort(key=lambda item: (item[0].energy, item[0].band_index))
    states = tuple(item[0] for item in state_rows)
    compositions = np.stack([item[1] for item in state_rows]).astype(np.float32, copy=False)
    warnings: tuple[str, ...] = ()
    if skipped_bands:
        shown = ", ".join(f"#{index + 1}" for index in skipped_bands[:8])
        remainder = len(skipped_bands) - min(len(skipped_bands), 8)
        suffix = f" and {remainder} more" if remainder else ""
        warnings = (
            "Skipped bands with zero projected weight at one or more used k-points: "
            f"{shown}{suffix}.",
        )
    return states, compositions, warnings


def normalize_kpoint_weights(
    weights: Sequence[float] | np.ndarray | None, nk: int
) -> tuple[np.ndarray, np.ndarray]:
    """Return normalized weights and a mask that excludes zero-weight k-points."""
    if nk <= 0:
        raise IprReadError("vasprun.xml contains no k-points.")
    if weights is None or len(weights) == 0:
        if nk == 1:
            normalized = np.ones(1, dtype=np.float64)
            return normalized, np.ones(1, dtype=bool)
        raise IprReadError("Multiple k-points require valid k-point weights in vasprun.xml.")

    try:
        array = np.asarray(weights, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise IprReadError("K-point weights must be numeric.") from exc
    if array.ndim != 1 or array.size != nk:
        raise IprReadError(f"Expected {nk} k-point weights, received {array.size}.")
    if not np.all(np.isfinite(array)):
        raise IprReadError("K-point weights must be finite.")
    if np.any(array < 0.0):
        raise IprReadError("K-point weights cannot be negative.")
    positive = array > 0.0
    total = float(array[positive].sum())
    if not np.any(positive) or not np.isfinite(total) or total <= 0.0:
        raise IprReadError("K-point weights must contain at least one positive value.")
    return array / total, positive


def _parse_vasprun(payload: bytes) -> object:
    try:
        from pymatgen.io.vasp.outputs import Vasprun
    except ImportError as exc:  # pragma: no cover - dependency always present
        raise IprReadError("pymatgen is required to parse vasprun.xml.") from exc

    try:
        with TemporaryDirectory(prefix="glance-vasprun-") as temp_dir:
            path = Path(temp_dir) / "vasprun.xml"
            path.write_bytes(payload)
            return Vasprun(
                str(path),
                parse_projected_eigen=True,
                parse_potcar_file=False,
            )
    except Exception as exc:
        raise IprReadError(f"Could not parse vasprun.xml: {exc}") from exc


def _validate_calculation_mode(vasprun: object) -> None:
    parameters = getattr(vasprun, "parameters", {}) or {}
    try:
        ispin = int(parameters.get("ISPIN", 1))
    except (TypeError, ValueError) as exc:
        raise IprReadError("Could not determine ISPIN from vasprun.xml.") from exc
    if ispin != 1:
        raise IprReadError("IPR atom contributions currently support only ISPIN = 1.")
    if _vasp_bool(parameters.get("LSORBIT", False)):
        raise IprReadError("IPR atom contributions do not yet support LSORBIT = True.")
    if _vasp_bool(parameters.get("LNONCOLLINEAR", False)):
        raise IprReadError("IPR atom contributions do not yet support LNONCOLLINEAR = True.")


def _vasp_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"true", ".true.", "t", "1", "yes"}
    return bool(value)


def _numeric_array(value: object, label: str) -> np.ndarray:
    try:
        array = np.asarray(value, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise IprReadError(f"{label} must be numeric.") from exc
    if not np.all(np.isfinite(array)):
        raise IprReadError(f"{label} contain non-finite values.")
    return array


def _finite_float(value: object, label: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise IprReadError(f"{label} must be numeric.") from exc
    if not np.isfinite(result):
        raise IprReadError(f"{label} must be finite.")
    return result


def _site_element(site: object) -> str:
    specie = getattr(site, "specie", None)
    symbol = getattr(specie, "symbol", None)
    if symbol:
        return str(symbol)
    species_string = getattr(site, "species_string", None)
    if species_string:
        return str(species_string)
    raise IprReadError("Could not determine an element for an atom in the final structure.")


def _total_dos(vasprun: object, efermi: float) -> dict[str, list[float]]:
    tdos = getattr(vasprun, "tdos", None)
    if tdos is None:
        raise IprReadError("vasprun.xml has no total density of states.")
    energy = _numeric_array(getattr(tdos, "energies", None), "DOS energies") - efermi
    if energy.ndim != 1 or energy.size == 0:
        raise IprReadError("Total DOS energies must be a non-empty one-dimensional array.")
    densities = getattr(tdos, "densities", None)
    if not isinstance(densities, Mapping) or not densities:
        raise IprReadError("vasprun.xml has no total DOS densities.")
    total = np.zeros_like(energy)
    for density in densities.values():
        values = _numeric_array(density, "DOS densities")
        if values.shape != energy.shape:
            raise IprReadError("DOS energies and densities have different lengths.")
        total = total + values
    return {"energy": energy.tolist(), "total": total.tolist()}

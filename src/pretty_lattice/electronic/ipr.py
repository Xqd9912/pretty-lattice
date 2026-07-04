"""Inverse participation ratio (IPR) from a VASP ``vasprun.xml``.

For each electronic state (spin, k-point, band) the IPR measures how localized
the wavefunction is across atoms::

    IPR = sum_i w_i^2 / (sum_i w_i)^2

where ``w_i`` is the projection weight on atom ``i`` (summed over orbitals). A
fully delocalized state over ``N`` atoms gives ``1/N``; a state localized on a
single atom gives ``1``. Energies are returned relative to the Fermi level so
the IPR bars and the total DOS share one axis.
"""

from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

# States are plotted as (thin) bars; cap how many we ship to the browser.
_MAX_STATES = 20000


class IprReadError(ValueError):
    """Raised when a vasprun.xml payload cannot be parsed for IPR."""


def compute_ipr(payload: bytes) -> dict[str, object]:
    """Parse ``vasprun.xml`` and return the total DOS and per-state IPR."""
    if not payload:
        raise IprReadError("Uploaded vasprun.xml file is empty.")

    try:
        from pymatgen.io.vasp.outputs import Vasprun
    except ImportError as exc:  # pragma: no cover - dependency always present
        raise IprReadError("pymatgen is required to parse vasprun.xml.") from exc

    try:
        with TemporaryDirectory(prefix="pretty-lattice-vasprun-") as temp_dir:
            path = Path(temp_dir) / "vasprun.xml"
            path.write_bytes(payload)
            vasprun = Vasprun(
                str(path),
                parse_projected_eigen=True,
                parse_potcar_file=False,
            )
    except Exception as exc:
        raise IprReadError(f"Could not parse vasprun.xml: {exc}") from exc

    if not vasprun.projected_eigenvalues:
        raise IprReadError(
            "vasprun.xml has no projected eigenvalues; rerun VASP with LORBIT >= 11 for IPR."
        )

    efermi = float(vasprun.efermi or 0.0)
    energies: list[float] = []
    iprs: list[float] = []

    for spin, projected in vasprun.projected_eigenvalues.items():
        eigen = np.asarray(vasprun.eigenvalues[spin])  # [nk, nband, 2]
        proj = np.asarray(projected)  # [nk, nband, nion, norb]
        weights = proj.sum(axis=3)  # [nk, nband, nion]
        denom = weights.sum(axis=2)  # [nk, nband]
        numer = (weights**2).sum(axis=2)  # [nk, nband]
        ipr = np.divide(numer, denom**2, out=np.zeros_like(numer), where=denom > 1e-8)
        state_energy = eigen[:, :, 0] - efermi
        energies.extend(state_energy.ravel().tolist())
        iprs.extend(ipr.ravel().tolist())

    if len(energies) > _MAX_STATES:
        raise IprReadError("vasprun.xml has more electronic states than can be visualized.")

    order = np.argsort(energies)
    energies_sorted = np.asarray(energies)[order]
    iprs_sorted = np.asarray(iprs)[order]

    dos = _total_dos(vasprun, efermi)
    return {
        "efermi": efermi,
        "dos": dos,
        "ipr": {
            "energy": energies_sorted.tolist(),
            "value": iprs_sorted.tolist(),
        },
    }


def _total_dos(vasprun: object, efermi: float) -> dict[str, object]:
    tdos = vasprun.tdos  # type: ignore[attr-defined]
    energy = np.asarray(tdos.energies) - efermi
    total = np.zeros_like(energy)
    for density in tdos.densities.values():
        total = total + np.asarray(density)
    return {"energy": energy.tolist(), "total": total.tolist()}

"""Parsing of VASP post-processed ``TDOS.dat`` total density of states.

``TDOS.dat`` is a whitespace-delimited table: an optional ``#`` header line
followed by rows of ``energy  dos`` (spin-polarized runs add a spin-down column,
and some tools append an integrated-DOS column). The first column is energy; the
remaining numeric columns are density-of-states channels.
"""

from __future__ import annotations

import numpy as np


class DosReadError(ValueError):
    """Raised when a TDOS.dat payload cannot be parsed."""


def parse_tdos(payload: bytes) -> dict[str, object]:
    """Parse ``TDOS.dat`` into energy and total density-of-states arrays."""
    if not payload:
        raise DosReadError("Uploaded TDOS.dat file is empty.")

    rows: list[list[float]] = []
    for raw_line in payload.decode("latin1").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            values = [float(token) for token in line.split()]
        except ValueError as exc:
            raise DosReadError(f"Could not parse a TDOS.dat row: {line!r}") from exc
        if len(values) >= 2:
            rows.append(values)

    if not rows:
        raise DosReadError("TDOS.dat has no numeric energy/DOS rows.")

    width = min(len(row) for row in rows)
    table = np.array([row[:width] for row in rows], dtype=float)
    energy = table[:, 0]

    # Column 1 is the (spin-up) total DOS; a second DOS column is spin-down.
    total = table[:, 1]
    channels: list[dict[str, object]] = [{"label": "TDOS", "values": total.tolist()}]
    if width >= 3:
        # Heuristic: a third column that is monotonic and non-negative is the
        # integrated DOS, otherwise it is the spin-down channel.
        third = table[:, 2]
        is_integrated = np.all(np.diff(third) >= -1e-9) and np.all(third >= -1e-9)
        if not is_integrated:
            channels.append({"label": "TDOS (down)", "values": third.tolist()})

    return {
        "energy": energy.tolist(),
        "total": total.tolist(),
        "channels": channels,
    }

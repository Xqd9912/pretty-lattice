"""Small in-memory LRU for unified vasprun electronic datasets."""

from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from collections.abc import Callable, Sequence

from glance.electronic.vasprun import (
    IPR_AGGREGATION,
    VasprunData,
    aggregate_site_pdos,
    parse_vasprun,
)

MAX_VASPRUN_ENTRIES = 2


class VasprunStore:
    def __init__(
        self,
        *,
        parser: Callable[[bytes], VasprunData] | None = None,
        max_entries: int = MAX_VASPRUN_ENTRIES,
    ) -> None:
        if max_entries < 1:
            raise ValueError("Vasprun store must retain at least one entry.")
        self._parser = parser or parse_vasprun
        self._max_entries = max_entries
        self._entries: OrderedDict[str, VasprunData] = OrderedDict()
        self._lock = threading.Lock()

    def create(self, payload: bytes) -> tuple[str, VasprunData]:
        data = self._parser(payload)
        electronic_id = uuid.uuid4().hex
        with self._lock:
            self._entries[electronic_id] = data
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)
        return electronic_id, data

    def get(self, electronic_id: str) -> VasprunData | None:
        with self._lock:
            data = self._entries.get(electronic_id)
            if data is not None:
                self._entries.move_to_end(electronic_id)
            return data


def vasprun_metadata(
    electronic_id: str,
    data: VasprunData,
    *,
    scene: dict[str, object],
) -> dict[str, object]:
    return {
        "electronicId": electronic_id,
        "source": "vasprun",
        "efermi": data.efermi,
        "energy": data.energy.tolist(),
        "dosSeries": [series.response() for series in data.dos_series],
        "pdosSeries": [series.response() for series in data.pdos_series],
        "orbitalTypes": list(data.orbital_types),
        "spinChannels": list(data.spin_channels),
        "capabilities": {
            name: capability.response() for name, capability in data.capabilities.items()
        },
        "ipr": {
            "aggregation": IPR_AGGREGATION,
            "states": [state.response() for state in data.ipr_states],
        },
        "scene": scene,
        "warnings": list(data.warnings),
    }


def ipr_state_contributions(
    data: VasprunData, state_id: str
) -> dict[str, object] | None:
    if data.ipr_compositions is None:
        return None
    for state_index, state in enumerate(data.ipr_states):
        if state.state_id != state_id:
            continue
        composition = data.ipr_compositions[state_index]
        site_indices = sorted(
            range(len(data.elements)),
            key=lambda site_index: (-float(composition[site_index]), site_index),
        )
        return {
            "state": state.response(),
            "contributions": [
                {
                    "siteIndex": site_index,
                    "element": data.elements[site_index],
                    "composition": float(composition[site_index]),
                    "iprContribution": float(composition[site_index]) ** 2,
                }
                for site_index in site_indices
            ],
        }
    return None


def site_pdos_response(data: VasprunData, site_indices: Sequence[int]) -> dict[str, object]:
    return {
        "energy": data.energy.tolist(),
        **aggregate_site_pdos(data, site_indices),
    }


__all__ = [
    "MAX_VASPRUN_ENTRIES",
    "VasprunStore",
    "ipr_state_contributions",
    "site_pdos_response",
    "vasprun_metadata",
]

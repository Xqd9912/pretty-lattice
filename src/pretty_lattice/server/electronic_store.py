"""In-memory store for parsed CHGCAR grids.

CHGCAR files are large (hundreds of MB) so we parse the payload once, keep the
normalized ``float32`` grid resident, and let the client scrub through slices by
id rather than re-uploading. The local server is single-user, so only a couple
of grids are kept resident at a time.
"""

from __future__ import annotations

import threading
import uuid
from collections import OrderedDict

from pretty_lattice.electronic.chgcar import ChgcarData, parse_chgcar

MAX_GRIDS = 2


class ElectronicStore:
    def __init__(self) -> None:
        self._entries: OrderedDict[str, ChgcarData] = OrderedDict()
        self._lock = threading.Lock()

    def create(self, payload: bytes) -> tuple[str, ChgcarData]:
        data = parse_chgcar(payload)
        chgcar_id = uuid.uuid4().hex
        with self._lock:
            self._entries[chgcar_id] = data
            while len(self._entries) > MAX_GRIDS:
                self._entries.popitem(last=False)
        return chgcar_id, data

    def get(self, chgcar_id: str) -> ChgcarData | None:
        with self._lock:
            data = self._entries.get(chgcar_id)
            if data is not None:
                self._entries.move_to_end(chgcar_id)
            return data


def chgcar_metadata(chgcar_id: str, data: ChgcarData) -> dict[str, object]:
    nx, ny, nz = data.grid
    return {
        "chgcarId": chgcar_id,
        "symbols": data.symbols,
        "counts": data.counts,
        "atomCount": data.atom_count,
        "grid": {"nx": nx, "ny": ny, "nz": nz},
        "totalElectrons": data.total_electrons,
    }

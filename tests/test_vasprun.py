from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient
from pymatgen.core import Lattice, Structure

import glance.electronic.ipr as ipr_module
import glance.electronic.vasprun as vasprun_module
import glance.server.routes as routes_module
from glance.electronic.vasprun import aggregate_site_pdos, parse_vasprun
from glance.server.app import create_app
from glance.server.vasprun_store import VasprunStore


class FakeDos:
    def __init__(self, values: list[float], *, down: list[float] | None = None) -> None:
        self.energies = np.asarray([3.0, 4.0, 5.0])
        self.densities = {1: np.asarray(values)}
        if down is not None:
            self.densities[-1] = np.asarray(down)


class FakeCompleteDos(FakeDos):
    def __init__(self, structure: Structure) -> None:
        super().__init__([3.0, 4.0, 5.0])
        self._structure = structure
        self._site = [
            {"s": FakeDos([1.0, 2.0, 3.0]), "p": FakeDos([0.5, 1.0, 1.5])},
            {"s": FakeDos([2.0, 4.0, 6.0]), "p": FakeDos([1.0, 2.0, 3.0])},
        ]

    def get_element_dos(self) -> dict[str, FakeDos]:
        return {
            "H": FakeDos([1.5, 3.0, 4.5]),
            "He": FakeDos([3.0, 6.0, 9.0]),
        }

    def get_spd_dos(self) -> dict[str, FakeDos]:
        return {
            "s": FakeDos([3.0, 6.0, 9.0]),
            "p": FakeDos([1.5, 3.0, 4.5]),
        }

    def get_element_spd_dos(self, element: str) -> dict[str, FakeDos]:
        site_index = 0 if str(element) == "H" else 1
        return self._site[site_index]

    def get_site_spd_dos(self, site: object) -> dict[str, FakeDos]:
        return self._site[self._structure.index(site)]


def _fake_vasprun(*, ispin: int = 1, tdos_down: bool = False) -> object:
    structure = Structure(
        Lattice.cubic(3.0),
        ["H", "He"],
        [[0.0, 0.0, 0.0], [0.5, 0.5, 0.5]],
    )
    return SimpleNamespace(
        parameters={"ISPIN": ispin, "LSORBIT": False, "LNONCOLLINEAR": False},
        projected_eigenvalues={1: np.asarray([[[[0.75], [0.25]]]])},
        eigenvalues={1: np.asarray([[[5.0, 1.0]]])},
        actual_kpoints_weights=[1.0],
        final_structure=structure,
        efermi=4.0,
        tdos=FakeDos(
            [2.0, 3.0, 4.0],
            down=[1.0, 1.5, 2.0] if tdos_down else None,
        ),
        complete_dos=FakeCompleteDos(structure),
    )


def test_vasprun_capabilities_and_site_pdos_share_one_parse(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def fake_parse(payload: bytes) -> object:
        nonlocal calls
        assert payload == b"vasprun"
        calls += 1
        return _fake_vasprun()

    monkeypatch.setattr(ipr_module, "_parse_vasprun", fake_parse)
    data = parse_vasprun(b"vasprun")

    assert calls == 1
    assert all(capability.available for capability in data.capabilities.values())
    assert data.energy.tolist() == pytest.approx([-1.0, 0.0, 1.0])
    assert data.orbital_types == ("s", "p")
    assert {series.kind for series in data.pdos_series} == {
        "element",
        "orbital",
        "element-orbital",
    }

    selected = aggregate_site_pdos(data, [1, 0, 1])
    assert selected["siteIndices"] == [0, 1]
    assert selected["atomCount"] == 2
    total = next(row for row in selected["series"] if row["orbital"] == "total")
    assert total["values"] == pytest.approx([4.5, 9.0, 13.5])


def test_vasprun_keeps_dos_when_ipr_mode_is_unsupported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ipr_module, "_parse_vasprun", lambda _payload: _fake_vasprun(ispin=2))
    data = parse_vasprun(b"spin-polarized")

    assert data.capabilities["dos"].available
    assert data.capabilities["pdos"].available
    assert not data.capabilities["ipr"].available
    assert "ISPIN = 1" in (data.capabilities["ipr"].reason or "")


def test_site_pdos_memory_limit_only_disables_site_capability(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ipr_module, "_parse_vasprun", lambda _payload: _fake_vasprun())
    monkeypatch.setattr(vasprun_module, "MAX_SITE_PDOS_VALUES", 1)
    data = parse_vasprun(b"large")

    assert data.capabilities["pdos"].available
    assert not data.capabilities["sitePdos"].available
    assert "too large" in (data.capabilities["sitePdos"].reason or "")


def test_site_pdos_uses_its_own_spin_channels(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        ipr_module,
        "_parse_vasprun",
        lambda _payload: _fake_vasprun(tdos_down=True),
    )
    data = parse_vasprun(b"mixed-spin-availability")

    assert data.spin_channels == ("up", "down")
    assert data.site_spin_channels == ("up",)
    selected = aggregate_site_pdos(data, [0])
    assert {row["spin"] for row in selected["series"]} == {"up"}


def test_vasprun_store_evicts_oldest_dataset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ipr_module, "_parse_vasprun", lambda _payload: _fake_vasprun())
    store = VasprunStore(parser=parse_vasprun, max_entries=2)
    first_id, _ = store.create(b"first")
    second_id, _ = store.create(b"second")
    third_id, _ = store.create(b"third")

    assert store.get(first_id) is None
    assert store.get(second_id) is not None
    assert store.get(third_id) is not None


@pytest.mark.anyio
async def test_unified_vasprun_endpoints(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ipr_module, "_parse_vasprun", lambda _payload: _fake_vasprun())
    store = VasprunStore(parser=parse_vasprun)
    monkeypatch.setattr(routes_module, "_vasprun_store", store)

    async with AsyncClient(
        transport=ASGITransport(app=create_app(dev_static_fallback=False)),
        base_url="http://test",
    ) as client:
        upload = await client.post("/api/electronic/vasprun", content=b"vasprun")
        assert upload.status_code == 200
        body = upload.json()
        assert body["capabilities"]["sitePdos"]["available"]
        assert body["scene"]["summary"]["atomCount"] == 2

        selected = await client.post(
            f"/api/electronic/vasprun/{body['electronicId']}/pdos/sites",
            json={"siteIndices": [1, 0, 1]},
        )
        assert selected.status_code == 200
        assert selected.json()["siteIndices"] == [0, 1]

        state = body["ipr"]["states"][0]
        detail = await client.get(
            f"/api/electronic/vasprun/{body['electronicId']}"
            f"/ipr/states/{state['stateId']}"
        )
        assert detail.status_code == 200
        assert [row["siteIndex"] for row in detail.json()["contributions"]] == [0, 1]

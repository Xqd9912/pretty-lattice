from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from pretty_lattice.electronic.chgcar import (
    isosurface,
    led_distribution,
    parse_chgcar,
    slice_plane,
)
from pretty_lattice.electronic.dos import parse_tdos
from pretty_lattice.server.app import create_app

TEST_STRU = Path(__file__).resolve().parent.parent / "test_stru"


def _chgcar_bytes() -> bytes:
    # 2x2x2 grid, one H atom. Grid mean is 1.0 so the values equal the
    # normalized density directly; two zero points sit below the LED threshold.
    values = [0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 3.0]
    lines = [
        "synthetic",
        "   1.00000000000000",
        "    2.000000    0.000000    0.000000",
        "    0.000000    2.000000    0.000000",
        "    0.000000    0.000000    2.000000",
        "   H",
        "    1",
        "Direct",
        "  0.000000  0.000000  0.000000",
        "",
        "    2    2    2",
        " ".join(f"{value:.11E}" for value in values),
    ]
    return ("\n".join(lines) + "\n").encode()


def _tdos_bytes() -> bytes:
    lines = ["#Energy  TDOS", "-1.0  0.0", "0.0  2.5", "1.0  4.0"]
    return ("\n".join(lines) + "\n").encode()


def test_parse_chgcar_normalizes_to_unit_mean() -> None:
    data = parse_chgcar(_chgcar_bytes())
    assert data.symbols == ["H"]
    assert data.grid == (2, 2, 2)
    assert data.density.shape == (2, 2, 2)
    assert data.density.mean() == pytest.approx(1.0, abs=1e-5)
    assert data.total_electrons == pytest.approx(1.0, abs=1e-6)


def test_led_distribution_fraction_and_curve() -> None:
    data = parse_chgcar(_chgcar_bytes())
    distribution = led_distribution(data, threshold=0.22)
    # Two of eight grid points are below 0.22 (the two zeros).
    assert distribution["ledFraction"] == pytest.approx(0.25)
    assert distribution["threshold"] == pytest.approx(0.22)
    assert len(distribution["density"]) == len(distribution["percent"])
    # The percentages are per-point shares that sum to 100 within the range.
    assert sum(distribution["percent"]) == pytest.approx(100.0, abs=1e-6)


def test_slice_plane_shapes_and_clamping() -> None:
    data = parse_chgcar(_chgcar_bytes())
    plane = slice_plane(data, "c", 99)
    assert plane["index"] == 1  # clamped into range
    assert plane["count"] == 2
    assert len(plane["matrix"]) == 2 and len(plane["matrix"][0]) == 2


def test_parse_chgcar_builds_structure() -> None:
    data = parse_chgcar(_chgcar_bytes())
    assert len(data.structure) == 1
    assert data.structure[0].specie.symbol == "H"


def test_isosurface_mesh_within_range() -> None:
    data = parse_chgcar(_chgcar_bytes())
    mesh = isosurface(data, level=0.5)
    assert mesh.vertex_count > 0
    assert mesh.triangle_count > 0
    # Every face index references a real vertex.
    assert int(mesh.faces.max()) < mesh.vertex_count
    # Binary packing round-trips the counts in the 8-byte header.
    packed = mesh.pack_binary()
    header = np.frombuffer(packed[:8], dtype="<u4")
    assert int(header[0]) == mesh.vertex_count
    assert int(header[1]) == mesh.triangle_count


def test_isosurface_out_of_range_is_empty() -> None:
    data = parse_chgcar(_chgcar_bytes())
    mesh = isosurface(data, level=99.0)
    assert mesh.vertex_count == 0
    assert mesh.triangle_count == 0


def test_parse_tdos_reads_energy_and_dos() -> None:
    dos = parse_tdos(_tdos_bytes())
    assert dos["energy"] == [-1.0, 0.0, 1.0]
    assert dos["total"] == [0.0, 2.5, 4.0]


@pytest.mark.anyio
async def test_chgcar_and_slice_endpoints() -> None:
    app = create_app(dev_static_fallback=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/electronic/chgcar?threshold=0.22", content=_chgcar_bytes()
        )
        assert response.status_code == 200
        body = response.json()
        assert body["grid"] == {"nx": 2, "ny": 2, "nz": 2}
        assert body["distribution"]["ledFraction"] == pytest.approx(0.25)
        assert body["slice"]["axis"] == "c"
        # The upload also returns a renderable structure scene and density range.
        assert len(body["scene"]["atoms"]) >= 1
        assert body["densityRange"]["max"] == pytest.approx(3.0)

        chgcar_id = body["chgcarId"]
        slice_response = await client.get(
            f"/api/electronic/chgcar/{chgcar_id}/slice", params={"axis": "a", "index": 0}
        )
        assert slice_response.status_code == 200
        assert slice_response.json()["axis"] == "a"

        iso_response = await client.get(
            f"/api/electronic/chgcar/{chgcar_id}/isosurface", params={"level": "0.5"}
        )
        assert iso_response.status_code == 200
        assert iso_response.headers["content-type"] == "application/octet-stream"
        payload = iso_response.content
        header = np.frombuffer(payload[:8], dtype="<u4")
        assert int(header[0]) == int(iso_response.headers["x-iso-vertices"])
        assert int(header[0]) > 0

        led_response = await client.get(
            f"/api/electronic/chgcar/{chgcar_id}/led", params={"threshold": "0.5"}
        )
        assert led_response.status_code == 200
        assert led_response.json()["threshold"] == pytest.approx(0.5)


@pytest.mark.anyio
async def test_dos_endpoint() -> None:
    app = create_app(dev_static_fallback=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/electronic/dos", content=_tdos_bytes())
        assert response.status_code == 200
        assert response.json()["total"] == [0.0, 2.5, 4.0]


@pytest.mark.anyio
@pytest.mark.skipif(
    not (TEST_STRU / "vasprun.xml").exists(), reason="vasprun.xml sample not available"
)
async def test_ipr_endpoint_with_real_vasprun() -> None:
    payload = (TEST_STRU / "vasprun.xml").read_bytes()
    app = create_app(dev_static_fallback=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=60.0) as client:
        response = await client.post("/api/electronic/ipr", content=payload)
        assert response.status_code == 200
        body = response.json()
        assert "efermi" in body
        assert len(body["ipr"]["energy"]) == len(body["ipr"]["value"])
        assert len(body["dos"]["energy"]) == len(body["dos"]["total"])

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

import glance.server.routes as routes_module
from glance.electronic.chgcar import (
    ChgcarReadError,
    atom_neighbors,
    isosurface,
    led_distribution,
    line_profile,
    parse_chgcar,
    parse_elfcar,
    slice_plane,
    value_histogram,
)
from glance.electronic.dos import parse_tdos
from glance.electronic.lobster import (
    LobsterReadError,
    parse_bwdf,
    parse_pair_list,
)
from glance.server.app import create_app

TEST_STRU = Path(__file__).resolve().parent.parent / "test_stru"
TEST_DATA = Path(__file__).resolve().parent.parent / "test_data"


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


def _elfcar_bytes() -> bytes:
    # 4x4x4 grid, two atoms 1 Angstrom apart along x in a 4 A cubic cell. ELF
    # values in [0, 1] must be kept raw (not mean-normalized).
    values = [round(0.1 + (i % 8) / 10.0, 3) for i in range(64)]
    lines = [
        "H2",
        "   1.00000000000000",
        "    4.000000    0.000000    0.000000",
        "    0.000000    4.000000    0.000000",
        "    0.000000    0.000000    4.000000",
        "   H",
        "    2",
        "Direct",
        "  0.000000  0.000000  0.000000",
        "  0.250000  0.000000  0.000000",
        "",
        "    4    4    4",
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
async def test_chgcar_and_slice_endpoints(monkeypatch: pytest.MonkeyPatch) -> None:
    scene_calls: list[dict[str, object]] = []
    original_build_scene_response = routes_module.build_scene_response

    def record_scene_build(structure: object, **kwargs: object) -> dict[str, object]:
        scene_calls.append(kwargs)
        return original_build_scene_response(structure, **kwargs)

    monkeypatch.setattr(routes_module, "build_scene_response", record_scene_build)
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
        assert scene_calls == [{}]
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


def test_parse_elfcar_keeps_raw_values() -> None:
    data = parse_elfcar(_elfcar_bytes())
    assert data.kind == "elfcar"
    assert data.value_label == "ELF"
    assert data.grid == (4, 4, 4)
    # ELF is NOT mean-normalized: values stay within their original [0, 1] range.
    assert 0.0 <= float(data.density.min())
    assert float(data.density.max()) <= 1.0
    assert data.density.mean() != pytest.approx(1.0)
    assert data.atom_labels() == ["H1", "H2"]


def test_value_histogram_sums_to_100() -> None:
    data = parse_elfcar(_elfcar_bytes())
    histogram = value_histogram(data, bin_width=0.05)
    assert len(histogram["value"]) == len(histogram["percent"])
    assert sum(histogram["percent"]) == pytest.approx(100.0, abs=1e-6)
    assert histogram["max"] <= 1.0


def test_line_profile_between_two_atoms() -> None:
    data = parse_elfcar(_elfcar_bytes())
    profile = line_profile(data, 0, 1, radius=0.6)
    # Atoms sit 1 A apart along x (0.25 * 4 A cell).
    assert profile["bondLength"] == pytest.approx(1.0, abs=1e-6)
    assert profile["labelI"] == "H1" and profile["labelJ"] == "H2"
    assert profile["voxelCount"] > 0
    assert len(profile["r"]) == len(profile["value"])
    assert all(0.0 <= r <= profile["bondLength"] + 1e-6 for r in profile["r"])


def test_atom_neighbors_sorted_within_cutoff() -> None:
    data = parse_elfcar(_elfcar_bytes())
    # Atom 0 and atom 1 sit 1 A apart along x in a 4 A cell.
    result = atom_neighbors(data, 0, r_cut=1.5)
    labels = [entry["label"] for entry in result["neighbors"]]
    assert result["labelI"] == "H1"
    assert "H2" in labels
    # Distances are sorted nearest first and never include the atom itself.
    distances = [entry["distance"] for entry in result["neighbors"]]
    assert distances == sorted(distances)
    assert all(entry["index"] != 0 for entry in result["neighbors"])
    # Tight cutoff drops the far images.
    assert len(atom_neighbors(data, 0, r_cut=1.1)["neighbors"]) < len(result["neighbors"]) + 1


def test_atom_neighbors_rejects_bad_index() -> None:
    data = parse_elfcar(_elfcar_bytes())
    with pytest.raises(ChgcarReadError):
        atom_neighbors(data, 99)


def test_line_profile_rejects_bad_atom_indices() -> None:
    data = parse_elfcar(_elfcar_bytes())
    with pytest.raises(ChgcarReadError):
        line_profile(data, 0, 0)
    with pytest.raises(ChgcarReadError):
        line_profile(data, 0, 99)


def _bwdf_bytes() -> bytes:
    return b" 0.00000  0.00000\n 2.34182  0.30245\n 2.42234  2.69526\n"


def _icohp_bytes() -> bytes:
    return (
        b"  COHP#    atomMU    atomNU   distance   translation   ICOHP (at) eF \n"
        b"                                                          for spin 1 \n"
        b"      1       Ge1      Ge53    2.59571     0   0   0        -3.69710 \n"
        b"      2       Ge1     Se242    2.44851     0   0   0        -4.21799 \n"
        b"      3       Se1     Se99     2.40000     0   0   0        -0.50000 \n"
    )


def test_parse_bwdf_two_columns() -> None:
    data = parse_bwdf(_bwdf_bytes())
    assert data["r"] == [0.0, 2.34182, 2.42234]
    assert data["value"][-1] == pytest.approx(2.69526)
    assert data["max"] == pytest.approx(2.69526)


def test_parse_pair_list_groups_by_element_pair() -> None:
    data = parse_pair_list(_icohp_bytes(), kind="icohp")
    assert data["kind"] == "icohp"
    assert data["count"] == 3
    assert data["pairs"] == ["Ge-Ge", "Ge-Se", "Se-Se"]
    first = data["records"][0]
    assert first["pair"] == "Ge-Ge"
    assert first["distance"] == pytest.approx(2.59571)
    assert first["value"] == pytest.approx(-3.69710)
    assert data["valueRange"]["min"] == pytest.approx(-4.21799)


def test_parse_pair_list_rejects_empty() -> None:
    with pytest.raises(LobsterReadError):
        parse_pair_list(b"COHP# header only\n", kind="icohp")


@pytest.mark.anyio
async def test_elfcar_and_grid_endpoints() -> None:
    app = create_app(dev_static_fallback=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/electronic/elfcar", content=_elfcar_bytes())
        assert response.status_code == 200
        body = response.json()
        assert body["kind"] == "elfcar"
        assert body["valueLabel"] == "ELF"
        assert body["grid"] == {"nx": 4, "ny": 4, "nz": 4}
        assert len(body["atoms"]) == 2
        assert body["distribution"]["max"] <= 1.0
        assert body["densityRange"]["max"] <= 1.0

        grid_id = body["gridId"]
        histogram = await client.get(f"/api/electronic/grid/{grid_id}/histogram")
        assert histogram.status_code == 200
        assert sum(histogram.json()["percent"]) == pytest.approx(100.0, abs=1e-6)

        neighbors = await client.get(
            f"/api/electronic/grid/{grid_id}/neighbors", params={"i": 0, "rcut": "1.5"}
        )
        assert neighbors.status_code == 200
        neighbor_labels = [entry["label"] for entry in neighbors.json()["neighbors"]]
        assert "H2" in neighbor_labels

        profile = await client.get(
            f"/api/electronic/grid/{grid_id}/line-profile",
            params={"i": 0, "j": 1, "radius": "0.6"},
        )
        assert profile.status_code == 200
        assert profile.json()["bondLength"] == pytest.approx(1.0, abs=1e-6)

        bad = await client.get(
            f"/api/electronic/grid/{grid_id}/line-profile", params={"i": 0, "j": 0}
        )
        assert bad.status_code == 400


@pytest.mark.anyio
async def test_lobster_endpoints() -> None:
    app = create_app(dev_static_fallback=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        bwdf = await client.post("/api/electronic/lobster/bwdf", content=_bwdf_bytes())
        assert bwdf.status_code == 200
        assert bwdf.json()["r"][0] == 0.0

        icohp = await client.post("/api/electronic/lobster/icohp", content=_icohp_bytes())
        assert icohp.status_code == 200
        assert icohp.json()["pairs"] == ["Ge-Ge", "Ge-Se", "Se-Se"]

        icoop = await client.post("/api/electronic/lobster/icoop", content=_icohp_bytes())
        assert icoop.status_code == 200
        assert icoop.json()["kind"] == "icoop"

        unknown = await client.post("/api/electronic/lobster/bogus", content=_icohp_bytes())
        assert unknown.status_code == 404


@pytest.mark.anyio
@pytest.mark.skipif(
    not (TEST_DATA / "electron" / "ELFCAR").exists(), reason="ELFCAR sample not available"
)
async def test_elfcar_endpoint_with_real_file() -> None:
    payload = (TEST_DATA / "electron" / "ELFCAR").read_bytes()
    app = create_app(dev_static_fallback=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=60.0) as client:
        response = await client.post("/api/electronic/elfcar", content=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["kind"] == "elfcar"
        assert body["atomCount"] == 300
        assert body["densityRange"]["max"] <= 1.01


@pytest.mark.anyio
@pytest.mark.skipif(
    not (TEST_DATA / "lobster" / "ICOHPLIST.lobster").exists(),
    reason="LOBSTER sample not available",
)
async def test_lobster_endpoint_with_real_file() -> None:
    payload = (TEST_DATA / "lobster" / "ICOHPLIST.lobster").read_bytes()
    app = create_app(dev_static_fallback=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/electronic/lobster/icohp", content=payload)
        assert response.status_code == 200
        assert set(response.json()["pairs"]) == {"Ge-Ge", "Ge-Se", "Se-Se"}


@pytest.mark.anyio
@pytest.mark.skipif(
    not (TEST_STRU / "vasprun.xml").exists(), reason="vasprun.xml sample not available"
)
async def test_vasprun_endpoint_with_real_file() -> None:
    payload = (TEST_STRU / "vasprun.xml").read_bytes()
    app = create_app(dev_static_fallback=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", timeout=60.0) as client:
        response = await client.post("/api/electronic/vasprun", content=payload)
        assert response.status_code == 200
        body = response.json()
        assert "efermi" in body
        assert body["ipr"]["aggregation"] == "k-weighted-band-composition"
        assert body["ipr"]["states"]
        assert body["scene"]["atoms"]
        assert all(
            len(series["values"]) == len(body["energy"])
            for series in body["dosSeries"]
        )

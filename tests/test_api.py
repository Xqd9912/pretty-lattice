import json
from pathlib import Path
from urllib.parse import quote

import pytest
from httpx import ASGITransport, AsyncClient

import glance.structures.connectivity as connectivity_module
from glance.server.app import create_app

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "structures"


@pytest.mark.anyio
async def test_health_endpoint() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_returns_scene() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=payload,
            headers={"x-glance-filename": "SrTiO3.cif"},
        )
        payload = response.json()

        assert response.status_code == 200
        assert payload["cell"]["vectors"] == [
            [3.91270131, 0.0, 0.0],
            [0.0, 3.91270131, 0.0],
            [0.0, 0.0, 3.91270131],
        ]
        assert payload["cell"]["periodic"] is True
        canonical_atoms = [atom for atom in payload["atoms"] if not atom["isPeriodicImage"]]
        periodic_image_atoms = [atom for atom in payload["atoms"] if atom["isPeriodicImage"]]
        assert [atom["element"] for atom in canonical_atoms] == ["Sr", "Ti", "O", "O", "O"]
        assert canonical_atoms[0]["siteId"] == "Sr-0"
        assert canonical_atoms[0]["siteIndex"] == 0
        assert canonical_atoms[0]["fractionalPosition"] == [0.0, 0.0, 0.0]
        assert canonical_atoms[0]["imageOffset"] == [0, 0, 0]
        assert canonical_atoms[0]["imageReasons"] == []
        assert canonical_atoms[0]["visibilityDependencies"] == []
        assert len(periodic_image_atoms) > 10
        assert len([atom for atom in payload["atoms"] if "boundary" in atom["imageReasons"]]) == 10
        assert len([atom for atom in payload["atoms"] if "bonded" in atom["imageReasons"]]) > 0
        assert "Sr-0" in {atom["siteId"] for atom in periodic_image_atoms}
        assert payload["bonds"]
        assert payload["polyhedra"]
        assert "warnings" not in payload
        assert payload["summary"] == {
            "formula": "SrTiO3",
            "atomCount": 5,
            "cell": {
                "a": "3.91",
                "b": "3.91",
                "c": "3.91",
                "alpha": "90.0",
                "beta": "90.0",
                "gamma": "90.0",
            },
            "symmetry": {
                "available": True,
                "spaceGroup": "Pm-3m",
                "spaceGroupNumber": 221,
                "pointGroup": "m-3m",
                "pointGroupSchoenflies": "Oh",
                "crystalSystem": "cubic",
                "latticeSystem": "cubic",
            },
        }
        assert "view" not in payload


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_accepts_supported_bond_algorithm() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview?bondAlgorithm=minimum-distance",
            content=payload,
            headers={"x-glance-filename": "SrTiO3.cif"},
        )

    assert response.status_code == 200
    assert response.json()["bonds"]
    assert "polyhedra" in response.json()


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_accepts_cutoff_dict_bond_algorithm() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview?bondAlgorithm=cut-off-dict",
            content=payload,
            headers={"x-glance-filename": "SrTiO3.cif"},
        )

    assert response.status_code == 200
    assert response.json()["bonds"]
    assert "polyhedra" in response.json()


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_rejects_unsupported_bond_algorithm() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview?bondAlgorithm=voronoi-nn",
            content=payload,
            headers={"x-glance-filename": "SrTiO3.cif"},
        )

    assert response.status_code == 400
    assert "Unsupported bond algorithm" in response.json()["detail"]["message"]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_accepts_custom_cutoffs() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()
    cutoffs = json.dumps([{"elements": ["O", "Ti"], "distance": 2.2}])

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            f"/api/structure-preview?bondAlgorithm=custom-cutoff&cutoffs={quote(cutoffs)}",
            content=payload,
            headers={"x-glance-filename": "SrTiO3.cif"},
        )

    body = response.json()
    atoms = body["atoms"]

    assert response.status_code == 200
    assert body["bonds"]
    assert body["bondCutoffs"]
    for bond in body["bonds"]:
        pair = {
            atoms[bond["startAtomIndex"]]["element"],
            atoms[bond["endAtomIndex"]]["element"],
        }
        assert pair == {"O", "Ti"}


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_rejects_invalid_cutoffs() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview?bondAlgorithm=custom-cutoff&cutoffs=not-json",
            content=payload,
            headers={"x-glance-filename": "SrTiO3.cif"},
        )

    assert response.status_code == 400
    assert "JSON" in response.json()["detail"]["message"]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_returns_bond_warning(monkeypatch) -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    def fail_bonds(**_kwargs: object) -> list[dict[str, object]]:
        raise RuntimeError("neighbor graph unavailable")

    monkeypatch.setattr(connectivity_module, "build_bonds", fail_bonds)

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=payload,
            headers={"x-glance-filename": "SrTiO3.cif"},
        )

    payload = response.json()
    assert response.status_code == 200
    assert payload["atoms"]
    assert payload["bonds"] == []
    assert "polyhedra" in payload
    assert payload["warnings"] == [
        {
            "code": "bond-analysis-failed",
            "message": "Bond analysis with CrystalNN failed: neighbor graph unavailable",
        }
    ]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_requires_pymatgen_recognizable_filename() -> None:
    payload = (FIXTURE_DIR / "SrTiO3.cif").read_bytes()

    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post("/api/structure-preview", content=payload)
        payload = response.json()

        assert response.status_code == 400
        assert "Could not parse uploaded structure" in payload["detail"]["message"]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_returns_parse_error() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=b"not a structure",
            headers={"x-glance-filename": "bad.cif"},
        )

        assert response.status_code == 400
        assert "Could not parse bad.cif" in response.json()["detail"]["message"]


@pytest.mark.anyio
async def test_structure_preview_upload_endpoint_rejects_oversized_payload() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/structure-preview",
            content=b"x" * (1 * 1024 * 1024 + 1),
            headers={"x-glance-filename": "movie.mp4"},
        )

        assert response.status_code == 413
        assert response.json()["detail"]["message"] == "File is too large to preview."


@pytest.mark.anyio
async def test_static_index_is_served_from_explicit_static_root(tmp_path) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Glance</title>")
    (tmp_path / "favicon.svg").write_text("<svg><title>Glance logo</title></svg>")

    async with AsyncClient(
        transport=ASGITransport(app=create_app(static_root=tmp_path, dev_static_fallback=False)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/")
        fallback_response = await client.get("/workspace")
        favicon_response = await client.get("/favicon.svg")
        missing_ico_response = await client.get("/favicon.ico")

        assert response.status_code == 200
        assert "Glance" in response.text
        assert fallback_response.status_code == 200
        assert "Glance" in fallback_response.text
        assert favicon_response.status_code == 200
        assert "Glance logo" in favicon_response.text
        assert "image/svg+xml" in favicon_response.headers["content-type"]
        assert missing_ico_response.status_code == 404


@pytest.mark.anyio
async def test_missing_static_root_returns_actionable_page(tmp_path, monkeypatch) -> None:
    # The built frontend is committed at glance/web_static, so the packaged-resource
    # candidate always resolves. Point that lookup at an empty directory too, so the
    # "frontend is not built" path can actually be exercised.
    monkeypatch.setattr("glance.server.app.resources.files", lambda _package: tmp_path)
    async with AsyncClient(
        transport=ASGITransport(app=create_app(static_root=tmp_path, dev_static_fallback=False)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/")

        assert response.status_code == 503
        assert "frontend is not built" in response.text
        assert "bun run build" in response.text

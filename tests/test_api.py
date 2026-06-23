from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from pretty_lattice.server.app import create_app

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
            headers={"x-pretty-lattice-filename": "SrTiO3.cif"},
        )
        payload = response.json()

        assert response.status_code == 200
        assert payload["cell"]["vectors"] == [
            [3.91270131, 0.0, 0.0],
            [0.0, 3.91270131, 0.0],
            [0.0, 0.0, 3.91270131],
        ]
        canonical_atoms = [atom for atom in payload["atoms"] if not atom["isPeriodicImage"]]
        periodic_image_atoms = [atom for atom in payload["atoms"] if atom["isPeriodicImage"]]
        assert [atom["element"] for atom in canonical_atoms] == ["Sr", "Ti", "O", "O", "O"]
        assert canonical_atoms[0]["siteId"] == "Sr-0"
        assert canonical_atoms[0]["fractionalPosition"] == [0.0, 0.0, 0.0]
        assert canonical_atoms[0]["imageOffset"] == [0, 0, 0]
        assert len(periodic_image_atoms) == 10
        assert "Sr-0" in {atom["siteId"] for atom in periodic_image_atoms}
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
        assert "bonds" not in payload
        assert "view" not in payload


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
            headers={"x-pretty-lattice-filename": "bad.cif"},
        )

        assert response.status_code == 400
        assert "Could not parse bad.cif" in response.json()["detail"]["message"]


@pytest.mark.anyio
async def test_static_index_is_served_from_explicit_static_root(tmp_path) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>Pretty Lattice</title>")
    (tmp_path / "favicon.svg").write_text("<svg><title>Pretty Lattice logo</title></svg>")

    async with AsyncClient(
        transport=ASGITransport(app=create_app(static_root=tmp_path, dev_static_fallback=False)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/")
        fallback_response = await client.get("/workspace")
        favicon_response = await client.get("/favicon.svg")
        missing_ico_response = await client.get("/favicon.ico")

        assert response.status_code == 200
        assert "Pretty Lattice" in response.text
        assert fallback_response.status_code == 200
        assert "Pretty Lattice" in fallback_response.text
        assert favicon_response.status_code == 200
        assert "Pretty Lattice logo" in favicon_response.text
        assert "image/svg+xml" in favicon_response.headers["content-type"]
        assert missing_ico_response.status_code == 404


@pytest.mark.anyio
async def test_missing_static_root_returns_actionable_page(tmp_path) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app(static_root=tmp_path, dev_static_fallback=False)),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/")

        assert response.status_code == 503
        assert "frontend is not built" in response.text
        assert "bun run build" in response.text

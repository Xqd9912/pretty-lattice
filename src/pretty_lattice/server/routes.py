from __future__ import annotations

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request

from pretty_lattice.structures.readers import StructureReadError, read_structure_bytes
from pretty_lattice.structures.scene import build_scene_response

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/structure-preview")
async def create_structure_preview(request: Request) -> dict[str, object]:
    filename = _uploaded_filename(request)
    try:
        structure = read_structure_bytes(await request.body(), filename=filename)
        return build_scene_response(structure)
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


def _uploaded_filename(request: Request) -> str:
    encoded_name = request.headers.get("x-pretty-lattice-filename")
    if encoded_name:
        return unquote(encoded_name)
    return "uploaded structure"

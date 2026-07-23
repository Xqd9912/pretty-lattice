from __future__ import annotations

import json
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query, Request, Response

from glance.analysis import pipeline as analysis_pipeline
from glance.electronic.chgcar import (
    ChgcarReadError,
    atom_neighbors,
    isosurface,
    led_distribution,
    line_profile,
    slice_plane,
    value_histogram,
)
from glance.electronic.dos import DosReadError, parse_tdos
from glance.electronic.lobster import (
    LobsterReadError,
    parse_bwdf,
    parse_pair_list,
)
from glance.server.electronic_store import ElectronicStore, chgcar_metadata
from glance.server.trajectory_store import (
    TrajectoryEntry,
    TrajectoryStore,
    scene_cache_key,
    trajectory_metadata,
)
from glance.server.vasprun_store import (
    VasprunStore,
    ipr_state_contributions,
    site_pdos_response,
    vasprun_metadata,
)
from glance.structures.readers import StructureReadError, read_structure_bytes
from glance.structures.scene_builder import build_scene_response
from glance.structures.schema import (
    BondCutoffSpec,
    UnsupportedBondAlgorithmError,
    normalize_bond_algorithm,
)
from glance.structures.trajectory import (
    MAX_TRAJECTORY_UPLOAD_BYTES,
    TrajectoryReadError,
)

router = APIRouter()
MAX_STRUCTURE_UPLOAD_BYTES = 1 * 1024 * 1024
# CHGCAR grids and vasprun.xml files are large; the server is local so we allow
# generous uploads for the electronic module.
MAX_CHGCAR_UPLOAD_BYTES = 600 * 1024 * 1024
MAX_VASPRUN_UPLOAD_BYTES = 200 * 1024 * 1024
MAX_DOS_UPLOAD_BYTES = 8 * 1024 * 1024
STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview."
TRAJECTORY_FILE_TOO_LARGE_MESSAGE = "Trajectory file is too large to load."
CHGCAR_FILE_TOO_LARGE_MESSAGE = "CHGCAR file is too large to load."
VASPRUN_FILE_TOO_LARGE_MESSAGE = "vasprun.xml file is too large to load."
DOS_FILE_TOO_LARGE_MESSAGE = "DOS file is too large to load."

_trajectory_store = TrajectoryStore()
_electronic_store = ElectronicStore()
_vasprun_store = VasprunStore()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/structure-preview")
async def create_structure_preview(
    request: Request,
    bond_algorithm: str | None = Query(default=None, alias="bondAlgorithm"),
    cutoffs: str | None = Query(default=None, alias="cutoffs"),
) -> dict[str, object]:
    filename = _uploaded_filename(request)
    try:
        normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    except UnsupportedBondAlgorithmError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    bond_cutoffs = _parse_bond_cutoffs(cutoffs)

    try:
        payload = await _uploaded_payload(request)
        structure = read_structure_bytes(payload, filename=filename)
        return build_scene_response(
            structure,
            bond_algorithm=normalized_bond_algorithm,
            bond_cutoffs=bond_cutoffs,
        )
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


def _parse_bond_cutoffs(raw: str | None) -> list[BondCutoffSpec] | None:
    if raw is None or raw == "":
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": "Bond cutoffs must be valid JSON."},
        ) from exc

    if not isinstance(parsed, list):
        raise HTTPException(
            status_code=400,
            detail={"message": "Bond cutoffs must be a list of element-pair cutoffs."},
        )

    cutoffs: list[BondCutoffSpec] = []
    for entry in parsed:
        elements = entry.get("elements") if isinstance(entry, dict) else None
        distance = entry.get("distance") if isinstance(entry, dict) else None
        if (
            not isinstance(elements, list)
            or len(elements) != 2
            or not all(isinstance(element, str) for element in elements)
            or not isinstance(distance, (int, float))
            or isinstance(distance, bool)
        ):
            raise HTTPException(
                status_code=400,
                detail={"message": "Each bond cutoff needs two elements and a distance."},
            )
        cutoffs.append({"elements": [elements[0], elements[1]], "distance": float(distance)})

    return cutoffs


async def _uploaded_payload(
    request: Request,
    *,
    max_bytes: int = MAX_STRUCTURE_UPLOAD_BYTES,
    too_large_message: str = STRUCTURE_FILE_TOO_LARGE_MESSAGE,
) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            upload_size = int(content_length)
        except ValueError:
            upload_size = None
        if upload_size is not None and upload_size > max_bytes:
            raise HTTPException(
                status_code=413,
                detail={"message": too_large_message},
            )

    payload = await request.body()
    if len(payload) > max_bytes:
        raise HTTPException(status_code=413, detail={"message": too_large_message})
    return payload


def _parse_type_map(raw: str | None) -> dict[int, str] | None:
    if raw is None or raw == "":
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": "Type map must be valid JSON."},
        ) from exc
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=400,
            detail={"message": "Type map must be an object of type id -> element."},
        )
    type_map: dict[int, str] = {}
    for key, value in parsed.items():
        try:
            type_id = int(key)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail={"message": "Type map keys must be integer type ids."},
            ) from exc
        if not isinstance(value, str) or not value.strip():
            raise HTTPException(
                status_code=400,
                detail={"message": "Type map values must be element symbols."},
            )
        type_map[type_id] = value.strip()
    return type_map


@router.post("/trajectory")
async def create_trajectory(
    request: Request,
    type_map: str | None = Query(default=None, alias="typeMap"),
) -> dict[str, object]:
    filename = _uploaded_filename(request)
    parsed_type_map = _parse_type_map(type_map)
    payload = await _uploaded_payload(
        request,
        max_bytes=MAX_TRAJECTORY_UPLOAD_BYTES,
        too_large_message=TRAJECTORY_FILE_TOO_LARGE_MESSAGE,
    )
    try:
        trajectory_id, entry = _trajectory_store.create(
            payload,
            filename=filename,
            type_map=parsed_type_map,
        )
    except TrajectoryReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    return trajectory_metadata(trajectory_id, entry)


@router.post("/trajectory/{trajectory_id}/type-map")
def update_trajectory_type_map(
    trajectory_id: str,
    type_map: str | None = Query(default=None, alias="typeMap"),
) -> dict[str, object]:
    parsed_type_map = _parse_type_map(type_map)
    if not parsed_type_map:
        raise HTTPException(status_code=400, detail={"message": "A type map is required."})
    try:
        entry = _trajectory_store.remap(trajectory_id, parsed_type_map)
    except TrajectoryReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    if entry is None:
        raise HTTPException(status_code=404, detail={"message": "Trajectory not found."})
    return trajectory_metadata(trajectory_id, entry)


@router.get("/trajectory/{trajectory_id}/frames/{frame_index}")
def get_trajectory_frame(
    trajectory_id: str,
    frame_index: int,
    bond_algorithm: str | None = Query(default=None, alias="bondAlgorithm"),
    cutoffs: str | None = Query(default=None, alias="cutoffs"),
) -> dict[str, object]:
    entry = _trajectory_store.get(trajectory_id)
    if entry is None:
        raise HTTPException(status_code=404, detail={"message": "Trajectory not found."})

    frames = entry.data.frames
    if frame_index < 0 or frame_index >= len(frames):
        raise HTTPException(status_code=404, detail={"message": "Frame index out of range."})

    try:
        normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    except UnsupportedBondAlgorithmError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    bond_cutoffs = _parse_bond_cutoffs(cutoffs)
    cache_key = scene_cache_key(frame_index, normalized_bond_algorithm, bond_cutoffs)

    def build_frame_scene() -> dict[str, object]:
        return build_scene_response(
            frames[frame_index],
            bond_algorithm=normalized_bond_algorithm,
            bond_cutoffs=bond_cutoffs,
        )

    return TrajectoryStore.cache_scene(entry, cache_key, build_frame_scene)


def _trajectory_symbols(entry: TrajectoryEntry) -> list[str]:
    return sorted({str(species.symbol) for species in entry.data.frames[0].composition.elements})


def _frame_indices(entry: TrajectoryEntry, body: dict[str, object]) -> list[int]:
    frame_count = len(entry.data.frames)
    start = int(body.get("frameStart", 0) or 0)
    raw_end = body.get("frameEnd")
    end = int(raw_end) if raw_end is not None else frame_count
    stride = max(1, int(body.get("stride", 1) or 1))
    start = max(0, min(start, frame_count))
    end = max(start, min(end, frame_count))
    indices = list(range(start, end, stride))
    if not indices:
        raise HTTPException(
            status_code=400, detail={"message": "The selected frame range is empty."}
        )
    return indices


def _require_trajectory(trajectory_id: str) -> TrajectoryEntry:
    entry = _trajectory_store.get(trajectory_id)
    if entry is None:
        raise HTTPException(status_code=404, detail={"message": "Trajectory not found."})
    return entry


async def _json_body(request: Request) -> dict[str, object]:
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail={"message": "Request body must be JSON."}
        ) from exc
    if not isinstance(body, dict):
        raise HTTPException(
            status_code=400, detail={"message": "Request body must be a JSON object."}
        )
    return body


@router.post("/trajectory/{trajectory_id}/analysis/gr")
async def analyze_gr(trajectory_id: str, request: Request) -> dict[str, object]:
    entry = _require_trajectory(trajectory_id)
    body = await _json_body(request)
    indices = _frame_indices(entry, body)
    symbols = _trajectory_symbols(entry)
    bin_width = float(body.get("binWidth") or analysis_pipeline.BIN_WIDTH)
    r_max = float(body.get("rMax") or analysis_pipeline.R_MAX)

    gr = analysis_pipeline.compute_gr(
        entry.data.frames, symbols, indices, bin_width=bin_width, r_max=r_max
    )
    return {
        "symbols": symbols,
        "frameCount": len(indices),
        "gr": gr,
        "suggestedCutoffs": analysis_pipeline.suggest_cutoffs(gr, symbols),
    }


@router.post("/trajectory/{trajectory_id}/analysis/descriptors")
async def analyze_descriptors(trajectory_id: str, request: Request) -> dict[str, object]:
    entry = _require_trajectory(trajectory_id)
    body = await _json_body(request)
    indices = _frame_indices(entry, body)
    symbols = _trajectory_symbols(entry)
    cutoffs = _parse_bond_cutoffs_body(body.get("cutoffs"))
    cutoff_matrix = analysis_pipeline.cutoff_matrix_from_pairs(cutoffs, symbols)

    descriptors = analysis_pipeline.compute_descriptors(
        entry.data.frames, symbols, indices, cutoff_matrix
    )
    return {"symbols": symbols, "frameCount": len(indices), "descriptors": descriptors}


@router.post("/trajectory/{trajectory_id}/analysis/rings")
async def analyze_rings(trajectory_id: str, request: Request) -> dict[str, object]:
    entry = _require_trajectory(trajectory_id)
    body = await _json_body(request)
    indices = _frame_indices(entry, body)
    symbols = _trajectory_symbols(entry)
    cutoffs = _parse_bond_cutoffs_body(body.get("cutoffs"))
    cutoff_matrix = analysis_pipeline.cutoff_matrix_from_pairs(cutoffs, symbols)

    min_size = int(body.get("minSize") or analysis_pipeline.RING_MIN_SIZE)
    max_size = int(body.get("maxSize") or analysis_pipeline.RING_MAX_SIZE)
    if min_size < 3 or max_size < min_size:
        raise HTTPException(
            status_code=400,
            detail={"message": "Ring sizes must satisfy 3 <= minSize <= maxSize."},
        )

    rings = analysis_pipeline.compute_rings(
        entry.data.frames, symbols, indices, cutoff_matrix,
        min_size=min_size, max_size=max_size,
    )
    return {"symbols": symbols, "frameCount": len(indices), "rings": rings}


@router.post("/trajectory/{trajectory_id}/analysis/dynamics")
async def analyze_dynamics(trajectory_id: str, request: Request) -> dict[str, object]:
    entry = _require_trajectory(trajectory_id)
    body = await _json_body(request)
    indices = _frame_indices(entry, body)

    try:
        dynamics = analysis_pipeline.compute_dynamics(
            entry.data.frames,
            indices,
            _trajectory_symbols(entry),
            r_min=float(body.get("rMin", 2.0) or 2.0),
            r_max=float(body.get("rMax", 4.0) or 4.0),
            n_point=int(body.get("nPoint", 100) or 100),
            cutoff_angle=float(body.get("cutoffAngle", 30.0) or 30.0),
            timestep=float(body.get("timestep", 1.0) or 1.0),
        )
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail={"message": "fastatomstruct is not installed; run pip install fastatomstruct."},
        ) from exc

    return {"frameCount": len(indices), "dynamics": dynamics}


def _parse_bond_cutoffs_body(raw: object) -> list[BondCutoffSpec]:
    if not isinstance(raw, list):
        raise HTTPException(
            status_code=400, detail={"message": "cutoffs must be a list of element-pair cutoffs."}
        )
    cutoffs: list[BondCutoffSpec] = []
    for entry in raw:
        elements = entry.get("elements") if isinstance(entry, dict) else None
        distance = entry.get("distance") if isinstance(entry, dict) else None
        if (
            not isinstance(elements, list)
            or len(elements) != 2
            or not all(isinstance(element, str) for element in elements)
            or not isinstance(distance, (int, float))
            or isinstance(distance, bool)
        ):
            raise HTTPException(
                status_code=400,
                detail={"message": "Each cutoff needs two elements and a distance."},
            )
        cutoffs.append({"elements": [elements[0], elements[1]], "distance": float(distance)})
    return cutoffs


def _uploaded_filename(request: Request) -> str:
    encoded_name = request.headers.get("x-glance-filename")
    if encoded_name:
        return unquote(encoded_name)
    return "uploaded structure"


def _float_query(raw: str | None, default: float) -> float:
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail={"message": "Expected a numeric value."}
        ) from exc


@router.post("/electronic/chgcar")
async def create_chgcar(
    request: Request,
    threshold: str | None = Query(default=None),
) -> dict[str, object]:
    payload = await _uploaded_payload(
        request,
        max_bytes=MAX_CHGCAR_UPLOAD_BYTES,
        too_large_message=CHGCAR_FILE_TOO_LARGE_MESSAGE,
    )
    led_threshold = _float_query(threshold, 0.22)
    try:
        chgcar_id, data = _electronic_store.create(payload)
        distribution = led_distribution(data, threshold=led_threshold)
        nz = data.grid[2]
        initial_slice = slice_plane(data, "c", nz // 2)
        scene = build_scene_response(data.structure)
    except ChgcarReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    return {
        **chgcar_metadata(chgcar_id, data),
        "distribution": distribution,
        "slice": initial_slice,
        "scene": scene,
        "densityRange": {"min": float(data.density.min()), "max": float(data.density.max())},
    }


@router.get("/electronic/chgcar/{chgcar_id}/isosurface")
def get_chgcar_isosurface(
    chgcar_id: str,
    level: str | None = Query(default=None),
) -> Response:
    data = _electronic_store.get(chgcar_id)
    if data is None:
        raise HTTPException(status_code=404, detail={"message": "CHGCAR grid not found."})
    iso_level = _float_query(level, 1.0)
    mesh = isosurface(data, level=iso_level)
    return Response(
        content=mesh.pack_binary(),
        media_type="application/octet-stream",
        headers={
            "x-iso-level": str(mesh.level),
            "x-iso-min": str(mesh.density_min),
            "x-iso-max": str(mesh.density_max),
            "x-iso-vertices": str(mesh.vertex_count),
            "x-iso-triangles": str(mesh.triangle_count),
        },
    )


@router.get("/electronic/chgcar/{chgcar_id}/slice")
def get_chgcar_slice(
    chgcar_id: str,
    axis: str = Query(default="c"),
    index: int = Query(default=0),
) -> dict[str, object]:
    data = _electronic_store.get(chgcar_id)
    if data is None:
        raise HTTPException(status_code=404, detail={"message": "CHGCAR grid not found."})
    try:
        return slice_plane(data, axis, index)
    except ChgcarReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.get("/electronic/chgcar/{chgcar_id}/led")
def get_chgcar_led(
    chgcar_id: str,
    threshold: str | None = Query(default=None),
) -> dict[str, object]:
    data = _electronic_store.get(chgcar_id)
    if data is None:
        raise HTTPException(status_code=404, detail={"message": "CHGCAR grid not found."})
    led_threshold = _float_query(threshold, 0.22)
    return led_distribution(data, threshold=led_threshold)


@router.post("/electronic/elfcar")
async def create_elfcar(request: Request) -> dict[str, object]:
    payload = await _uploaded_payload(
        request,
        max_bytes=MAX_CHGCAR_UPLOAD_BYTES,
        too_large_message=CHGCAR_FILE_TOO_LARGE_MESSAGE,
    )
    try:
        elfcar_id, data = _electronic_store.create(payload, kind="elfcar")
        distribution = value_histogram(data)
        nz = data.grid[2]
        initial_slice = slice_plane(data, "c", nz // 2)
        scene = build_scene_response(data.structure)
    except ChgcarReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    except StructureReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

    return {
        **chgcar_metadata(elfcar_id, data),
        "distribution": distribution,
        "slice": initial_slice,
        "scene": scene,
        "densityRange": {"min": float(data.density.min()), "max": float(data.density.max())},
    }


def _require_grid(grid_id: str):
    data = _electronic_store.get(grid_id)
    if data is None:
        raise HTTPException(status_code=404, detail={"message": "Volumetric grid not found."})
    return data


@router.get("/electronic/grid/{grid_id}/histogram")
def get_grid_histogram(grid_id: str) -> dict[str, object]:
    return value_histogram(_require_grid(grid_id))


@router.get("/electronic/grid/{grid_id}/neighbors")
def get_grid_neighbors(
    grid_id: str,
    i: int = Query(...),
    rcut: str | None = Query(default=None),
) -> dict[str, object]:
    data = _require_grid(grid_id)
    cutoff = _float_query(rcut, 3.5)
    try:
        return atom_neighbors(data, i, r_cut=cutoff)
    except ChgcarReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.get("/electronic/grid/{grid_id}/line-profile")
def get_grid_line_profile(
    grid_id: str,
    i: int = Query(...),
    j: int = Query(...),
    radius: str | None = Query(default=None),
) -> dict[str, object]:
    data = _require_grid(grid_id)
    cylinder_radius = _float_query(radius, 0.5)
    try:
        return line_profile(data, i, j, radius=cylinder_radius)
    except ChgcarReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.post("/electronic/lobster/bwdf")
async def create_lobster_bwdf(request: Request) -> dict[str, object]:
    payload = await _uploaded_payload(
        request, max_bytes=MAX_DOS_UPLOAD_BYTES, too_large_message=DOS_FILE_TOO_LARGE_MESSAGE
    )
    try:
        return parse_bwdf(payload)
    except LobsterReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.post("/electronic/lobster/{kind}")
async def create_lobster_pair_list(kind: str, request: Request) -> dict[str, object]:
    normalized = kind.lower()
    if normalized not in {"icohp", "icoop"}:
        raise HTTPException(
            status_code=404, detail={"message": "Unknown LOBSTER list kind."}
        )
    payload = await _uploaded_payload(
        request, max_bytes=MAX_DOS_UPLOAD_BYTES, too_large_message=DOS_FILE_TOO_LARGE_MESSAGE
    )
    try:
        return parse_pair_list(payload, kind=normalized)
    except LobsterReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.post("/electronic/dos")
async def create_dos(request: Request) -> dict[str, object]:
    payload = await _uploaded_payload(
        request,
        max_bytes=MAX_DOS_UPLOAD_BYTES,
        too_large_message=DOS_FILE_TOO_LARGE_MESSAGE,
    )
    try:
        return parse_tdos(payload)
    except DosReadError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.post("/electronic/vasprun")
async def create_vasprun(request: Request) -> dict[str, object]:
    payload = await _uploaded_payload(
        request,
        max_bytes=MAX_VASPRUN_UPLOAD_BYTES,
        too_large_message=VASPRUN_FILE_TOO_LARGE_MESSAGE,
    )
    try:
        electronic_id, data = _vasprun_store.create(payload)
        scene = build_scene_response(data.structure, bond_algorithm="custom-cutoff")
        return vasprun_metadata(electronic_id, data, scene=scene)
    except (ValueError, StructureReadError) as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@router.get("/electronic/vasprun/{electronic_id}/ipr/states/{state_id}")
async def get_vasprun_ipr_state(
    electronic_id: str, state_id: str
) -> dict[str, object]:
    data = _vasprun_store.get(electronic_id)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail={"message": "Electronic dataset not found or expired; reload vasprun.xml."},
        )
    response = ipr_state_contributions(data, state_id)
    if response is None:
        raise HTTPException(
            status_code=404,
            detail={"message": "IPR state not found; reload vasprun.xml."},
        )
    return response


@router.post("/electronic/vasprun/{electronic_id}/pdos/sites")
async def create_vasprun_site_pdos(
    electronic_id: str, request: Request
) -> dict[str, object]:
    data = _vasprun_store.get(electronic_id)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail={"message": "Electronic dataset not found or expired; reload vasprun.xml."},
        )
    body = await _json_body(request)
    raw_site_indices = body.get("siteIndices")
    if not isinstance(raw_site_indices, list) or any(
        isinstance(value, bool) or not isinstance(value, int) for value in raw_site_indices
    ):
        raise HTTPException(
            status_code=400,
            detail={"message": "siteIndices must be a list of integer atom indices."},
        )
    try:
        return site_pdos_response(data, raw_site_indices)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc

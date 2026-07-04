"""VASP ``CHGCAR`` charge-density parsing, LED distribution and slicing.

VASP writes the charge density on a regular grid as ``rho(r) * V_cell`` with the
first index fastest (Fortran order). The grid average therefore equals the total
number of valence electrons in the cell, so dividing every point by that mean
yields a dimensionless density relative to the cell average — exactly the
normalization the reference Fortran (``low_electron_density.f``) performs when it
divides by the hardcoded valence-electron count, but robust to element and
pseudopotential choice.

"Low electron density" (LED) regions are grid points whose normalized density is
below an empirical threshold (``0.22`` for phase-change materials). The LED
*fraction* — the share of the cell below that threshold — tracks with the
amorphous/crystalline character of chalcogenides.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from pymatgen.core import Structure

DEFAULT_LED_THRESHOLD = 0.22
DEFAULT_BIN_WIDTH = 0.01
DEFAULT_MAX_DENSITY = 6.0
# Guard rails on the volume held in memory for interactive slicing.
_MAX_GRID_POINTS = 600 * 600 * 600
# Marching cubes runs on a grid downsampled so its largest axis is at most this,
# keeping the isosurface mesh light enough to render and ship to the browser.
DEFAULT_ISOSURFACE_TARGET_DIM = 96


class ChgcarReadError(ValueError):
    """Raised when a CHGCAR payload cannot be parsed."""


@dataclass
class ChgcarData:
    """Parsed CHGCAR: metadata plus the mean-normalized density grid.

    ``density`` is indexed ``[iz, iy, ix]`` (z slowest) to match the Fortran
    write order once reshaped, and is stored as ``float32`` to halve resident
    memory for the large grids CHGCAR files carry.
    """

    symbols: list[str]
    counts: list[int]
    lattice: np.ndarray  # (3, 3) Cartesian lattice vectors in Angstrom
    grid: tuple[int, int, int]  # (nx, ny, nz)
    density: np.ndarray  # normalized, [nz, ny, nx], float32, mean == 1
    total_electrons: float  # grid mean of raw CHGCAR == integrated valence e-
    structure: Structure  # atoms + cell, for reusing the structure renderer

    @property
    def atom_count(self) -> int:
        return int(sum(self.counts))


def _read_line(raw: bytes, pos: int) -> tuple[str, int]:
    end = raw.find(b"\n", pos)
    if end == -1:
        return raw[pos:].decode("latin1"), len(raw)
    return raw[pos:end].decode("latin1"), end + 1


def parse_chgcar(payload: bytes) -> ChgcarData:
    """Parse a CHGCAR payload into a :class:`ChgcarData`.

    Only the first (total-charge) data block is read; spin-density or
    augmentation-occupancy sections that follow are ignored.
    """
    if not payload:
        raise ChgcarReadError("Uploaded CHGCAR file is empty.")

    try:
        pos = 0
        _comment, pos = _read_line(payload, pos)
        scale_line, pos = _read_line(payload, pos)
        scale = float(scale_line.split()[0])
        vectors = []
        for _ in range(3):
            line, pos = _read_line(payload, pos)
            vectors.append([float(value) for value in line.split()[:3]])
        lattice = np.array(vectors, dtype=float) * scale

        symbols_line, pos = _read_line(payload, pos)
        counts_line, pos = _read_line(payload, pos)
        symbols = symbols_line.split()
        counts = [int(value) for value in counts_line.split()]
        if not symbols or len(symbols) != len(counts):
            raise ChgcarReadError(
                "CHGCAR is missing an element/count header. Is this a VASP CHGCAR file?"
            )
        natoms = int(sum(counts))

        coord_mode, pos = _read_line(payload, pos)
        cartesian = coord_mode.strip()[:1].lower() in {"c", "k"}
        coords = []
        for _ in range(natoms):
            line, pos = _read_line(payload, pos)
            coords.append([float(value) for value in line.split()[:3]])
        _blank, pos = _read_line(payload, pos)
        grid_line, pos = _read_line(payload, pos)
        grid_tokens = grid_line.split()
        if len(grid_tokens) < 3:
            raise ChgcarReadError("Could not find the CHGCAR grid dimensions (NGXF NGYF NGZF).")
        nx, ny, nz = (int(grid_tokens[0]), int(grid_tokens[1]), int(grid_tokens[2]))
    except ChgcarReadError:
        raise
    except (ValueError, IndexError) as exc:
        raise ChgcarReadError(f"Could not parse CHGCAR header: {exc}") from exc

    n_points = nx * ny * nz
    if n_points <= 0:
        raise ChgcarReadError("CHGCAR grid dimensions must be positive.")
    if n_points > _MAX_GRID_POINTS:
        raise ChgcarReadError("CHGCAR grid is too large to load.")

    flat = np.fromstring(payload[pos:], sep=" ", count=n_points)
    if flat.size != n_points:
        raise ChgcarReadError(
            f"CHGCAR declares {n_points} grid points but only {flat.size} values were read."
        )

    mean = float(flat.mean())
    if mean == 0.0 or not np.isfinite(mean):
        raise ChgcarReadError("CHGCAR grid has a zero or non-finite average density.")

    density = (flat / mean).astype(np.float32).reshape(nz, ny, nx)

    species = [
        symbol for symbol, count in zip(symbols, counts, strict=True) for _ in range(count)
    ]
    try:
        structure = Structure(
            lattice,
            species,
            np.array(coords, dtype=float),
            coords_are_cartesian=cartesian,
        )
    except Exception as exc:
        raise ChgcarReadError(f"Could not build a structure from CHGCAR atoms: {exc}") from exc

    return ChgcarData(
        symbols=symbols,
        counts=counts,
        lattice=lattice,
        grid=(nx, ny, nz),
        density=density,
        total_electrons=mean,
        structure=structure,
    )


def led_distribution(
    data: ChgcarData,
    *,
    threshold: float = DEFAULT_LED_THRESHOLD,
    bin_width: float = DEFAULT_BIN_WIDTH,
    max_density: float = DEFAULT_MAX_DENSITY,
) -> dict[str, object]:
    """Histogram of the normalized density and the LED fraction.

    The curve is the share of grid points (in percent) falling in each
    ``bin_width``-wide normalized-density bin, matching the reference Fortran
    output. The LED fraction is the share of points in ``[0, threshold]``.
    """
    values = data.density.ravel()
    n = values.size
    edges = np.arange(0.0, max_density + bin_width, bin_width)
    counts, _ = np.histogram(values, bins=edges)
    percent = counts / n * 100.0
    centers = edges[:-1]

    led_fraction = float(np.count_nonzero((values >= 0.0) & (values <= threshold)) / n)
    return {
        "threshold": float(threshold),
        "binWidth": float(bin_width),
        "ledFraction": led_fraction,
        "density": centers.tolist(),
        "percent": percent.tolist(),
        "min": float(values.min()),
        "max": float(values.max()),
    }


def slice_plane(data: ChgcarData, axis: str, index: int) -> dict[str, object]:
    """Extract a 2D slice of the normalized density perpendicular to ``axis``.

    ``axis`` is one of ``"a"``, ``"b"`` or ``"c"`` (the lattice directions,
    mapping to the x/y/z grid indices). The returned matrix is row-major and
    ready to feed the heatmap component.
    """
    nx, ny, nz = data.grid
    axis = axis.lower()
    if axis == "a":
        length, plane = nx, ("c", "b")
        index = _clamp_index(index, length)
        matrix = data.density[:, :, index]  # [nz, ny]
    elif axis == "b":
        length, plane = ny, ("c", "a")
        index = _clamp_index(index, length)
        matrix = data.density[:, index, :]  # [nz, nx]
    elif axis == "c":
        length, plane = nz, ("b", "a")
        index = _clamp_index(index, length)
        matrix = data.density[index, :, :]  # [ny, nx]
    else:
        raise ChgcarReadError(f"Unknown slice axis {axis!r}; expected 'a', 'b' or 'c'.")

    return {
        "axis": axis,
        "index": index,
        "count": length,
        "rowAxis": plane[0],
        "colAxis": plane[1],
        "matrix": np.asarray(matrix, dtype=float).tolist(),
    }


def _clamp_index(index: int, length: int) -> int:
    if length <= 0:
        return 0
    return max(0, min(int(index), length - 1))


@dataclass
class IsosurfaceMesh:
    """Iso-density surface: Cartesian vertices + triangle indices."""

    level: float
    vertices: np.ndarray  # (N, 3) float32, Cartesian Angstrom
    faces: np.ndarray  # (M, 3) uint32 triangle vertex indices
    density_min: float
    density_max: float

    @property
    def vertex_count(self) -> int:
        return int(self.vertices.shape[0])

    @property
    def triangle_count(self) -> int:
        return int(self.faces.shape[0])

    def pack_binary(self) -> bytes:
        """Little-endian: [uint32 nVerts][uint32 nTris][float32 verts][uint32 faces]."""
        header = np.array([self.vertex_count, self.triangle_count], dtype="<u4")
        return (
            header.tobytes()
            + self.vertices.astype("<f4").tobytes()
            + self.faces.astype("<u4").tobytes()
        )


def isosurface(
    data: ChgcarData,
    *,
    level: float,
    target_dim: int = DEFAULT_ISOSURFACE_TARGET_DIM,
) -> IsosurfaceMesh:
    """Triangulated iso-density surface at ``level`` (normalized units).

    Runs marching cubes on the (downsampled) grid and maps the vertices into the
    same Cartesian frame as the structure's atoms, so the mesh overlays the
    atoms/bonds directly. Vertex normals are left to the client to compute, which
    sidesteps normal-transform issues for non-orthogonal cells.
    """
    from skimage import measure

    nx, ny, nz = data.grid
    density_min = float(data.density.min())
    density_max = float(data.density.max())
    step = max(1, int(np.ceil(max(nx, ny, nz) / max(1, target_dim))))
    volume = data.density[::step, ::step, ::step]

    empty = IsosurfaceMesh(
        level=float(level),
        vertices=np.empty((0, 3), dtype=np.float32),
        faces=np.empty((0, 3), dtype=np.uint32),
        density_min=density_min,
        density_max=density_max,
    )
    if not (float(volume.min()) < level < float(volume.max())):
        return empty

    try:
        verts, faces, _normals, _values = measure.marching_cubes(
            np.ascontiguousarray(volume), level=level
        )
    except (ValueError, RuntimeError):
        return empty

    # Marching-cubes vertex axes are (c, b, a) in downsampled-index space. A
    # downsampled index j maps to original index j*step, so the fractional
    # coordinate along an axis of n points is j*step/n.
    frac = np.empty_like(verts)
    frac[:, 0] = verts[:, 2] * step / nx  # a
    frac[:, 1] = verts[:, 1] * step / ny  # b
    frac[:, 2] = verts[:, 0] * step / nz  # c
    cartesian = (frac @ data.lattice).astype(np.float32)

    return IsosurfaceMesh(
        level=float(level),
        vertices=cartesian,
        faces=faces.astype(np.uint32),
        density_min=density_min,
        density_max=density_max,
    )

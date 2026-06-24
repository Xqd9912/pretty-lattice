## Why

Pretty Lattice already computes pymatgen-backed bonds and keeps complete one-hop bonded image data in the scene. The next natural structure component is coordination polyhedra, using the same connectivity so common motifs like `TiO6`, `SiO4`, and `AlO6` can be viewed without adding browser-side crystal analysis.

## What Changes

- Add Crystal Toolkit-compatible polyhedra generation semantics to the backend scene builder.
- Use the selected bond algorithm's connectivity for both bonds and polyhedra.
- Generate polyhedra only for centers that pass Crystal Toolkit's conditions: more than three drawn connected sites, no missing connected sites, and center species lower in pymatgen's electronegativity ordering than every connected neighbor.
- Build a closed convex hull from the center atom plus connected neighbor positions, matching Crystal Toolkit's position set semantics.
- Extend the scene response with project-owned polyhedron records, including center atom, hull atom IDs, faces, color, and visibility-dependency metadata.
- Render polyhedra as translucent surfaces with edge outlines in the Three.js preview.
- Enable the existing `Polyhedra` display row when the loaded scene includes polyhedra, while preserving independent atoms, bonds, unit-cell, cell-boundary atom, and one-hop bonded atom controls.
- Treat polyhedra generation failures as non-fatal analysis warnings when the structure itself still parses.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `structure-backend`: The backend gains Crystal Toolkit-compatible coordination polyhedra generation from the same pymatgen connectivity used for bonds.
- `structure-preview`: The scene contract and browser preview gain renderable polyhedra records, local polyhedra visibility control, and filtering behavior tied to existing image visibility dependencies.

## Impact

- Python scene-building code and tests under `src/pretty_lattice/structures/` and `tests/`.
- Local API response shape for `/api/structure-preview`.
- Frontend scene types, component visibility state, Three.js rendering, and tests under `web/src/` and `web/tests/`.
- May use existing SciPy availability from pymatgen's environment for convex hull generation; no browser-side crystallographic dependency should be added.

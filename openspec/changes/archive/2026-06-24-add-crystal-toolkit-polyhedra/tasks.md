## 1. Backend Polyhedra Data

- [x] 1.1 Refactor scene-building internals so bond records and polyhedron records share one selected-neighbor connectivity pass.
- [x] 1.2 Add backend scene contract support for polyhedron records with center atom ID, hull atom IDs, face indices, color, and visibility metadata.
- [x] 1.3 Implement Crystal Toolkit-compatible center eligibility: more than three drawn connected atoms, no missing connected atoms, and lower pymatgen species ordering than every connected neighbor.
- [x] 1.4 Generate hull faces from the center-plus-connected-atom position set and skip degenerate individual centers without returning invalid geometry.
- [x] 1.5 Return non-fatal analysis warnings for scene-level polyhedra generation failures while preserving available atom, cell, and bond data.

## 2. Backend Tests

- [x] 2.1 Add fixture-backed tests that generate polyhedra for a representative complete coordination environment.
- [x] 2.2 Add tests that suppress reverse centers and same-species centers according to the Crystal Toolkit-compatible electronegativity rule.
- [x] 2.3 Add tests that prove polyhedra follow the selected bond algorithm and do not use a separate hard-coded connectivity source.
- [x] 2.4 Add tests for empty polyhedra results, skipped degenerate centers, and non-fatal polyhedra warning responses.

## 3. Frontend Scene State And Rendering

- [x] 3.1 Extend frontend scene types and visible-scene filtering for polyhedron records and their hull atom dependencies.
- [x] 3.2 Render polyhedra as translucent surfaces with edge outlines from returned hull atom IDs and face indices.
- [x] 3.3 Enable the `Polyhedra` display checkbox when scene data includes polyhedra, keep it disabled when absent, and preserve independent component visibility behavior.
- [x] 3.4 Preserve local visibility state when bond algorithm changes regenerate both bonds and polyhedra from the selected algorithm.

## 4. Frontend Tests And Validation

- [x] 4.1 Add unit tests for polyhedra filtering when boundary or one-hop image atoms are hidden.
- [x] 4.2 Add render/state tests for toggling Polyhedra independently from Atoms, Bonds, and Unit cell.
- [x] 4.3 Add frontend tests covering enabled and disabled Polyhedra display-row states.
- [x] 4.4 Run backend tests, frontend tests, typecheck/build, OpenSpec validation, and a focused preview visual check for polyhedra rendering.

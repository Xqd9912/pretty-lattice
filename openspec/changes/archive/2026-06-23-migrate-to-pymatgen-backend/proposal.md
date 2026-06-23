## Why

Pretty Lattice is moving from a first-preview prototype toward a backend that
can support real crystallographic analysis. ASE was useful for the MVP parser
path, but pymatgen better matches the project's structure IO, symmetry, bond
graph, and future polyhedra needs.

This migration is cheap to do now because ASE is still confined to a small
backend surface, while later features would make the dependency harder to
untangle.

## What Changes

- Use pymatgen `Structure` / `Lattice` as the canonical backend structure model.
- Parse uploaded structure files through pymatgen, with local CIF fixtures as
  the committed backend baseline.
- Preserve the existing scene response shape and current frontend preview
  behavior.
- Move symmetry summaries to pymatgen's higher-level symmetry API.
- Remove ASE from the runtime dependency set.
- Remove direct project usage of `spglib` and avoid keeping it as a direct
  dependency when pymatgen provides the needed wrapper.
- **BREAKING**: The structure preview path no longer promises ASE-readable
  non-CIF formats or molecule-style files as part of the backend contract.

## Capabilities

### New Capabilities

- `structure-backend`: Backend structure parsing, canonical pymatgen model,
  scene input semantics, symmetry summary, dependency boundary, and fixture
  policy.

### Modified Capabilities

- `structure-preview`: Replace ASE-specific parsing language with the backend
  structure service, and make CIF fixtures the committed parser/scene baseline.

## Impact

- Python dependencies: add pymatgen, remove ASE, and remove direct `spglib`.
- Python backend: structure readers, scene conversion, symmetry summary, and
  related tests.
- Tests: rely on local CIF fixtures for parser and scene regression coverage.
- Frontend API: no required response-shape change; existing scene JSON remains
  project-owned and browser-friendly.

## Context

The current structure preview path reads uploaded files with ASE, converts ASE
`Atoms` into the project scene JSON, and calls `spglib` directly for symmetry
summary data. That was a good MVP path because it was small and easy to test.

Pretty Lattice is now moving toward richer crystal visualization: symmetry,
bond graphs, one-hop periodic completion, and eventually coordination
polyhedra. Those are materials-analysis concerns, so the Python backend needs a
crystal-first object model.

The project constitution already names pymatgen in the backend stack, and the
new decision document accepts pymatgen as the canonical structure backend. The
existing frontend scene contract should remain stable while the Python
implementation changes underneath it.

## Goals / Non-Goals

**Goals:**

- Replace ASE `Atoms` with pymatgen `Structure` as the backend structure object.
- Keep the API response shape stable for the current browser preview.
- Use pymatgen's symmetry API for user-facing symmetry summaries.
- Remove direct runtime dependencies on ASE and `spglib`.
- Use the local CIF fixture set for parser and scene regression coverage.

**Non-Goals:**

- Do not add bond rendering, polyhedra rendering, or new visual controls in this
  migration.
- Do not promise non-periodic molecule files in the structure-preview path.

## Decisions

### Use pymatgen Structure as the canonical backend object

The reader should return pymatgen `Structure` objects. Scene construction should
read lattice vectors, Cartesian positions, fractional positions, elements,
composition, and periodicity from that object.

Alternative considered: keep ASE for IO and convert to pymatgen later. That
would preserve the old parser surface, but it would keep two structure models
alive and make future bond and polyhedra work less direct.

### Keep scene JSON project-owned

The frontend should continue receiving the current scene JSON: cell vectors,
atom instances, summary fields, radius, and color. Pymatgen objects stay inside
Python.

This keeps the migration backend-only from the browser's point of view and
protects the frontend from Python library details.

### Treat CIF fixtures as the backend baseline

Tests should use the local CIF fixture matrix for parsing, scene construction,
and symmetry summary checks. The goal is not to test whether pymatgen reads
every format exactly like ASE; that belongs upstream.

This makes the project tests smaller and clearer, while still covering simple,
layered, high-symmetry, multi-element, and larger cells.

### Remove direct spglib usage

Pymatgen wraps spglib for symmetry analysis. Pretty Lattice should depend on the
pymatgen-level API and stop importing `spglib` directly.

If a current field cannot be produced through pymatgen directly, the first
choice is to derive it from pymatgen-supported metadata or make that field
nullable. Schoenflies point-group symbols are derived through a small
project-owned table generated from spglib's Hall-number database, keyed by the
Hermann-Mauguin point-group symbol returned by pymatgen. A direct `spglib`
dependency should not remain only for a small decorative summary field.

## Risks / Trade-offs

- Some files that ASE accepted may no longer parse through the preview path ->
  Keep the committed contract focused on CIF fixtures and report parse errors
  clearly.
- Pymatgen may represent composition/formula ordering differently from ASE ->
  Update tests around user-facing formula strings and keep expectations tied to
  the scene summary.
- Dropping direct `spglib` may remove Schoenflies symbols for point-group
  symbols outside the crystallographic mapping table -> Keep the field nullable
  rather than preserving a direct low-level dependency.
- Large CIFs may expose scene-size or boundary-image growth -> Use the fixture
  matrix to catch obvious regressions before adding heavier analysis features.

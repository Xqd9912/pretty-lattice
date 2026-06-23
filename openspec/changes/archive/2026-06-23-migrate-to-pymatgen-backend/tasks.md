## 1. Dependencies And Backend Boundary

- [x] 1.1 Add pymatgen as the runtime structure backend dependency.
- [x] 1.2 Remove ASE from the runtime dependency set.
- [x] 1.3 Remove direct `spglib` from the runtime dependency set when pymatgen covers the needed symmetry API.
- [x] 1.4 Confirm backend structure modules no longer import ASE or `spglib` directly.

## 2. Structure Reading And Scene Conversion

- [x] 2.1 Update structure readers to return pymatgen `Structure` objects and clear project-level parse errors.
- [x] 2.2 Update scene conversion to read lattice vectors, Cartesian positions, fractional positions, element symbols, and canonical site count from pymatgen structures.
- [x] 2.3 Preserve the existing scene response shape, including atom IDs, site IDs, periodic image offsets, radius, color, and summary fields.
- [x] 2.4 Keep boundary-image generation behavior equivalent for the committed CIF fixtures.

## 3. Symmetry Summary

- [x] 3.1 Replace direct `spglib` symmetry calls with pymatgen-level symmetry analysis.
- [x] 3.2 Preserve available summary fields for space group, space-group number, point group, crystal system, and lattice system.
- [x] 3.3 Return nullable supplementary symmetry fields when pymatgen metadata and project-owned mappings do not provide the value cleanly.

## 4. Tests And Fixtures

- [x] 4.1 Update parser and scene tests to use the local CIF fixture matrix as the committed baseline.
- [x] 4.2 Remove old POSCAR and non-CIF parser assumptions from the automated tests.
- [x] 4.3 Add dependency-boundary checks for absence of direct ASE and `spglib` usage in backend structure modules.
- [x] 4.4 Verify API upload behavior with a CIF fixture and invalid-file parse errors.

## 5. Verification

- [x] 5.1 Run `uv run ruff check .`.
- [x] 5.2 Run `uv run pytest`.
- [x] 5.3 Run the frontend type/build checks if the API scene types or frontend-facing response shape changes. Ran `bun run build` and `bun test` as a frontend smoke check.

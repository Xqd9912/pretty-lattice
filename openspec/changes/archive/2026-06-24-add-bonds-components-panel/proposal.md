## Why

Pretty Lattice is ready to move beyond atoms plus a unit-cell frame. The next useful preview step is to render bonds, including one-hop bonded periodic image atoms, while giving the user a stable place to choose which scene components are visible.

## What Changes

- Add backend bond analysis for preview scenes, defaulting to pymatgen `CrystalNN`.
- Extend the scene response with bond records, image-reason metadata for periodic atom instances, and non-fatal analysis warnings.
- Return a display-ready scene superset so cell-boundary atoms and one-hop bonded atoms can be toggled locally without re-uploading the structure.
- Render light-gray, thicker fixed-radius bonds in the Three.js scene with the same material family as atoms.
- Add a second left floating card below the structure summary card with shadcn Tabs for `Camera`, `Display`, `Style`, and `Export`.
- Default the new panel to `Display`, with active tab labels shown in full and inactive tabs shown as icons with tooltips.
- Implement the `Display` tab with visible-component checkboxes for `Atoms`, `Unit cell`, `Bonds`, and disabled `Polyhedra`, plus image switches for `Cell-boundary atoms` and `One-hop bonded atoms`.
- Keep local filtering from changing the fitted unit-cell visual scale, and keep bonds visible whenever both endpoints remain visible.
- Convert the right settings drawer into `Advanced Settings`, keeping rotation mode there and adding a bond algorithm selector for supported pymatgen neighbor strategies.
- Use a shared shadcn-style alert component for fatal parse errors and non-fatal analysis warnings.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `structure-preview`: The browser preview gains bond rendering, component visibility controls, local filtering for periodic image roles without camera renormalization, left tab-panel UI, and alert presentation for scene warnings.
- `structure-backend`: The Python backend gains preview bond analysis, selectable pymatgen neighbor algorithms, one-hop bonded image generation, and non-fatal warning reporting.

## Impact

- Python scene-building code and tests under `src/pretty_lattice/structures/` and `tests/`.
- Local API request/response shape for `/api/structure-preview`.
- Frontend scene types, rendering, settings state, and tests under `web/src/` and `web/tests/`.
- Frontend dependencies can add Radix/shadcn components for Tabs, Checkbox, Alert, and Select-style algorithm choice if not already present.

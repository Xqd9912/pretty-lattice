## 1. Backend Scene Contract And Bond Analysis

- [x] 1.1 Add request handling for a finite bond-algorithm setting, defaulting to CrystalNN and rejecting unsupported identifiers with a clear client error.
- [x] 1.2 Implement preview bond generation through supported pymatgen neighbor algorithms without exposing pymatgen objects in the scene JSON.
- [x] 1.3 Extend atom instances with image-reason and visibility-dependency metadata while preserving canonical atom counts.
- [x] 1.4 Generate the display-ready superset for cell-boundary atoms, one-hop bonded atoms from canonical atoms, and one-hop bonded atoms from cell-boundary atoms without recursive expansion.
- [x] 1.5 Return non-fatal analysis warnings when bond analysis fails after successful parsing, while still returning atom and cell scene data.

## 2. Frontend Scene State And Rendering

- [x] 2.1 Update frontend scene types for bonds, image reasons, visibility dependencies, analysis warnings, and bond algorithm settings.
- [x] 2.2 Add local component visibility state with defaults for atoms, unit cell, bonds, cell-boundary atoms, and one-hop bonded atoms.
- [x] 2.3 Implement visible-scene filtering so cell-boundary atom and one-hop bonded atom toggles work locally without re-uploading the file or changing preview fitting bounds.
- [x] 2.4 Render light-gray thicker fixed-radius bond cylinders using the same material family as atom spheres, and hide bonds whose endpoints are filtered out.
- [x] 2.5 Preserve component visibility when regenerating the scene for a changed bond algorithm, and reset defaults when loading a new file.

## 3. Left Panel And Advanced Settings UI

- [x] 3.1 Add the needed shadcn-style UI building blocks for tabs, checkboxes, alerts, and the bond algorithm selector.
- [x] 3.2 Add the second left floating tab card below the structure summary card with `Camera`, `Display`, `Style`, and `Export` tabs.
- [x] 3.3 Implement active tab icon-plus-label behavior, inactive icon-only tabs with tooltips, default `Display` selection, and animated height changes without internal scrolling.
- [x] 3.4 Implement the `Display` tab with component checkboxes and `Images` switches, including a disabled unchecked `Polyhedra` row.
- [x] 3.5 Rename the right drawer to `Advanced Settings`, keep rotation mode there, add bond algorithm selection, and remove cell-boundary atom visibility from the drawer.
- [x] 3.6 Replace the hand-built parse-error block with a shared alert component and show non-fatal analysis warnings in the left structure card.

## 4. Verification

- [x] 4.1 Add backend tests for default CrystalNN behavior, supported and unsupported bond algorithms, one-hop bonded image generation, and non-fatal warning responses.
- [x] 4.2 Add frontend unit tests for local component filtering, bond endpoint filtering, tab-panel behavior, advanced bond algorithm changes, and alert rendering.
- [x] 4.3 Run the Python test suite and frontend tests/build for the changed areas.
- [x] 4.4 Perform source-level UI validation for the loaded preview, left tab panel, right Advanced Settings drawer, and bond rendering; browser visual QA is intentionally left for user review.

## 1. Camera Math and State

- [x] 1.1 Add helpers for direct lattice vectors, reciprocal lattice vectors, Gram-Schmidt projection, coefficient normalization, and VESTA-like fallback selection.
- [x] 1.2 Add frontend camera-control state for primary direction, direct coefficients, reciprocal coefficients, Roll, collapsed vector-editor state, and draft vector edits.
- [x] 1.3 Replace the loaded/reset Standard three-quarter pose with the VESTA-like default `Primary direction = Outward`, `Outward = c`, `Upward = b*`, `Roll = 0°`.
- [x] 1.4 Keep the rendered camera pose synchronized with the existing Three.js quaternion snapshot used by the gizmo and export path.

## 2. Camera Tab UI

- [x] 2.1 Replace the Camera tab reserved content with `Primary direction` tabs using the existing common-controls tab styling.
- [x] 2.2 Add a live Roll control that updates the preview immediately and preserves the primary direct direction.
- [x] 2.3 Add a collapsed `Vectors` editor with the selected primary row first, basis labels that swap by primary direction, and numeric inputs styled like existing panel inputs.
- [x] 2.4 Make vector edits batch-applied with Apply/Cancel-or-reset behavior so partially typed values do not rotate the preview.
- [x] 2.5 Ensure switching primary direction re-expresses the current camera state without rotating the preview.

## 3. Orientation Gizmo Interaction

- [x] 3.1 Make the orientation gizmo axes pointer-interactive while preserving its camera-following visual behavior.
- [x] 3.2 Add hover brightening and pointer cursor for clickable `a`, `b`, and `c` axes without tooltips or persistent active highlights.
- [x] 3.3 Apply single-click gizmo axis alignment according to the current primary direction and VESTA-like fallback behavior.

## 4. Tests and Validation

- [x] 4.1 Add focused tests for reciprocal-vector math, VESTA-like fallback order, Roll angle updates, coefficient normalization, and degenerate fallback behavior.
- [x] 4.2 Add frontend tests for Camera tab controls, vector draft/apply behavior, reset default, primary-direction switching, and gizmo click routing.
- [x] 4.3 Run `bun run test`, `bun run typecheck`, `bun run build`, and `git diff --check`.
- [x] 4.4 Run `openspec validate add-crystal-camera-controls --strict`.

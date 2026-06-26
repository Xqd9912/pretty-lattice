## Why

The current preview has interactive rotation and zoom, but the `Camera` tab is still reserved and the reset view is a presentational three-quarter pose. Pretty Lattice needs a crystal-aware camera system that can express reproducible viewing directions in lattice terms, while keeping quick interactions lightweight.

## What Changes

- Replace the reserved `Camera` tab with implemented camera controls using the existing panel tab and input styling.
- Add a `Primary direction` tab control with `Upward` and `Outward` modes.
- Add a live `Roll` control that rotates around the current primary direct-lattice direction using a VESTA-like canonical anchor.
- Add a collapsed `Vectors` editor for precise lattice-direction input, with the primary semantic row shown first and direct/reciprocal basis labels assigned according to the selected primary direction.
- Make the orientation gizmo interactive: hovering an axis highlights it, and clicking `a`, `b`, or `c` applies that axis to the current primary direction.
- Change the loaded and reset camera default from the current three-quarter view to a reproducible VESTA-like pose: `Primary direction = Outward`, `Outward = c`, `Upward = b*`, `Roll = 0°`.
- Keep the live preview/export orientation represented internally as a Three.js quaternion snapshot, while deriving it from crystal-direction camera state for these controls.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `structure-preview`: replace the reserved Camera tab and Standard three-quarter reset behavior with crystal-aware camera controls, VESTA-like default orientation, clickable orientation gizmo axes, roll adjustment, and a collapsed precise vector editor.

## Impact

- Frontend state and controls for preview camera orientation.
- Three.js camera pose math for direct and reciprocal lattice directions.
- Orientation gizmo interaction behavior and visual hover feedback.
- Existing reset/export orientation flow, which should continue to use the current preview orientation through the camera-pose snapshot boundary.
- Frontend tests for the Camera tab, reset behavior, gizmo interactions, and camera math.

## Why

The structure preview currently uses a fixed internal camera, so loaded scenes are visible but not naturally inspectable. This change makes the preview feel like an interactive crystal viewer while keeping figure framing resettable and bounded.

## What Changes

- Replace the fixed preview pose with a reproducible Standard default: a c-up three-quarter orthographic view that keeps the c-axis screen projection upward while preserving depth.
- Add free rotation for loaded structures, defaulting to Trackball-style interaction.
- Add an advanced interaction-mode setting in the right Settings drawer so the user can switch between Trackball and Orbit rotation behavior.
- Keep panning disabled in both interaction modes so mouse gestures do not change figure composition through translation.
- Add bounded zoom as part of the same preview interaction model, with wheel zoom and a linked vertical zoom rail.
- Express zoom as a percentage of the fitted view, clamped from 20% to 500%, with a logarithmic slider and editable percentage input.
- Add a canvas interaction lock that disables mouse gesture changes while leaving explicit controls available.
- Add a reset control that restores Standard orientation, 100% zoom, and centered framing.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `structure-preview`: the browser preview changes from a fixed internal camera to a bounded interactive camera with Standard reset, Trackball/Orbit rotation mode selection, locked canvas gestures, no pan, and percentage-based zoom controls.

## Impact

- Frontend Three.js camera and controls in the structure preview scene.
- Right-side Settings drawer gains an advanced interaction-mode option.
- Left-side preview overlay gains reset, lock, zoom slider, and zoom percentage input controls.
- Frontend tests for default view math, zoom clamping, reset behavior, lock behavior, interaction-mode selection, and pan suppression.
- Rendered frontend validation for loaded scenes, free rotation, wheel/slider/input zoom sync, lock, reset, and Trackball/Orbit switching.

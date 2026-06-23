## 1. View State And Standard Pose

- [x] 1.1 Add a frontend view-state boundary for orientation, fitted zoom, user zoom percentage, lock state, and interaction mode.
- [x] 1.2 Replace the fixed scene rotation and camera position with the Standard c-up three-quarter view computed from loaded cell vectors.
- [x] 1.3 Keep reset independent of individual control internals and restore Standard orientation, 100% zoom, and centered framing.

## 2. Interactive Controls

- [x] 2.1 Add Trackball rotation as the default canvas drag interaction for loaded scenes.
- [x] 2.2 Add Orbit rotation as an alternate interaction mode and keep camera, target, and zoom synchronized when switching modes.
- [x] 2.3 Disable pan gestures in both Trackball and Orbit modes.
- [x] 2.4 Implement canvas interaction lock so drag rotation and wheel zoom are ignored while explicit controls remain usable.

## 3. Zoom And Overlay UI

- [x] 3.1 Implement zoom as a 20% to 500% percentage of fitted view and apply the same clamp to wheel, slider, and input paths.
- [x] 3.2 Add the compact left-side view-control rail with reset, lock, vertical logarithmic zoom slider, and editable zoom percentage input.
- [x] 3.3 Add the Trackball/Orbit interaction-mode control to the right Settings drawer without adding unrelated placeholder controls.
- [x] 3.4 Update preview safe-area layout so the loaded structure avoids the left card and view-control rail.

## 4. Validation

- [x] 4.1 Add frontend unit tests for Standard view math, zoom mapping/clamping, and view-state reset behavior.
- [x] 4.2 Add or update interaction tests for mode switching, lock behavior, synchronized zoom controls, and pan suppression where practical.
- [x] 4.3 Run frontend typecheck/build and the affected Python/frontend test suites.
- [x] 4.4 Visually verify a loaded structure in the browser: Standard default, Trackball drag, Orbit switch, wheel/slider/input zoom sync, lock, reset, and no pan.

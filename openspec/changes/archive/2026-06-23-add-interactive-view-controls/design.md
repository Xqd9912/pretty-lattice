## Context

The current browser preview renders a full-window Three.js scene with atoms and the unit cell, but the camera is still an internal fixed default. The project now needs a first real view interaction layer: users should be able to drag the structure, zoom within useful bounds, lock the canvas against accidental gestures, and return to a reproducible default view.

The existing UI already has a left structure card, a bottom legend, and a right Settings drawer. This change should fit into that layout instead of creating a broad visual-control panel.

## Goals / Non-Goals

**Goals:**

- Make the loaded structure preview rotatable with Trackball-style interaction by default.
- Allow Orbit-style interaction as a low-frequency advanced setting in the right drawer.
- Keep panning disabled in both interaction modes.
- Add bounded zoom with mouse wheel, a vertical logarithmic slider, and an editable percentage value.
- Keep reset behavior reproducible: Standard orientation, 100% zoom, and centered framing.
- Keep the view-control architecture ready for later crystallographic Upward/Outward controls without implementing those controls now.

**Non-Goals:**

- Do not implement Upward/Outward direction input or angle-wheel controls in this change.
- Do not change the Python scene response or add camera settings to the API.
- Do not add pan as a user-facing composition control.

## Decisions

### Use one shared preview view state

Trackball, Orbit, wheel zoom, the zoom rail, lock, and reset should operate on one shared view state rather than keeping separate camera truths. The view state should include:

- the current camera orientation;
- the centered target used for the loaded cell;
- `viewScale`, a user-facing zoom multiplier;
- `interactionMode`, either `trackball` or `orbit`;
- `interactionLocked`, a boolean for canvas gestures.

The exact internal representation can use Three.js camera fields and control instances, but the app-level behavior should stay independent of a specific control's reset state.

### Define Standard as a reproducible c-up three-quarter view

The default preview pose should be computed from the loaded cell vectors:

```text
outward = normalize(normalize(a) + normalize(b) + normalize(c))
up      = normalize(c - outward * dot(c, outward))
```

The camera sits along `outward` and looks back at the centered structure target. The `up` direction makes the c-axis screen projection point upward, while the three-quarter outward direction keeps visible depth. This is the Pretty Lattice Standard view, not the VESTA reset view.

### Keep zoom as a percentage of fitted view

The user-facing zoom value should be:

```text
viewScale = camera.zoom / fitZoom
```

`fitZoom` is recalculated from the loaded scene span, viewport size, and preview safe areas. `viewScale` is clamped to `0.2` through `5.0`, shown as `20%` through `500%`, and reset to `100%`.

The vertical slider should use logarithmic mapping so the midpoint is `100%`:

```text
scale = minScale * (maxScale / minScale) ^ t
```

Mouse-wheel zoom, slider changes, and percentage input all update the same `viewScale`.

### Disable pan in both interaction modes

Panning should remain off for Trackball and Orbit. This keeps mouse gestures from moving the structure away from the figure framing. If later export composition needs translation controls, that should be designed as an explicit figure-layout feature rather than inherited from free navigation.

### Put common controls beside the left card and advanced mode in Settings

Reset, lock, and zoom are common while inspecting a structure. They should appear as a compact vertical rail attached near the existing left structure card after a scene has loaded.

The Trackball/Orbit switch is lower-frequency and belongs in the right Settings drawer under an interaction-related section. The drawer already hosts low-frequency display settings, so this avoids crowding the main preview.

## Risks / Trade-offs

- Trackball and Orbit maintain different internal control state -> synchronize through the shared camera, target, and zoom before enabling the selected mode.
- Wheel zoom and slider zoom can drift apart -> make both paths write through the same clamped `viewScale`.
- The rail can crowd the left card -> keep it narrow, icon-led, and present only after a valid scene is loaded.
- `fitZoom` changes when safe areas or viewport size change -> keep `viewScale` as the durable user value and recompute `camera.zoom = fitZoom * viewScale`.
- Control defaults can accidentally allow pan -> cover pan suppression with tests or browser interaction validation.

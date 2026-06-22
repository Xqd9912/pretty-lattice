## Context

The current structure preview API returns one renderable atom per ASE atom, using Cartesian position, radius, and color. The frontend directly maps `scene.atoms` to Three.js spheres, and the preview already uses safe-area values to avoid placing the main structure under the left card and bottom legend.

The next step is to make unit-cell boundary atoms look visually complete without turning this into a general supercell or bonding feature. At the same time, the app needs a first home for low-frequency Settings after a structure is loaded: a right-side full-height drawer that complements the existing compact left-side structure card.

## Goals / Non-Goals

**Goals:**

- Represent boundary atom repeats as visual atom instances linked back to canonical structure sites.
- Keep `summary.atomCount` as the canonical structure atom count, not the number of rendered spheres.
- Let the frontend toggle boundary atom images locally without re-uploading or re-parsing the structure.
- Establish a right-side Settings drawer that can later hold more low-frequency visual settings.
- Keep the panel visually consistent with the current light, restrained shadcn/Vercel-inspired UI.

**Non-Goals:**

- Do not add bond detection or outside-cell bonded atoms in this change.
- Do not add arbitrary supercell repeat controls.
- Do not add a broad visual-control panel for radius, color, lighting, or camera.

## Decisions

### Scene atoms remain renderable instances

`scene.atoms` should continue to mean "the atom spheres the frontend can draw." Each record will gain metadata:

- `siteId`: stable canonical site identity within the parsed structure.
- `imageOffset`: integer lattice offset for this visual instance.
- `isPeriodicImage`: whether the instance is a visual repeat rather than the canonical site.
- `fractionalPosition`: fractional position after applying the image offset.

This keeps the frontend simple: it still draws `scene.atoms`, and the boundary toggle filters out records where `isPeriodicImage` is true. A separate `sites` collection can be added later if editing or selection needs it, but it is not needed for this display slice.

### Boundary repeats close the displayed unit cell only

The backend should canonicalize periodic fractional coordinates into a half-open cell, using a small tolerance around 0 and 1. For each coordinate component on a boundary, the scene builder creates visual instances at both the canonical side and the far side of the displayed cell. A site on one face creates one image; a site on an edge creates three images plus the canonical instance; a site on a corner creates seven images plus the canonical instance.

The generated offsets should close the displayed `[0, 1]` unit cell, not create a surrounding `3 x 3 x 3` neighborhood. For non-periodic structures or invalid 3D cells, the scene builder should leave atoms unexpanded.

### The `Show boundary atom images` setting is frontend-local

The API should provide both canonical and boundary-image instances in one response. The frontend stores a local `showBoundaryAtoms` display state, defaulting to on for periodic structures with available boundary images. Turning it off only changes which atom instances are rendered; it does not change the parsed structure, summary, legend semantics, or backend state.

### The right Settings drawer is the low-frequency settings home

The left side remains for structure facts and common file actions. Settings live behind a compact right-side trigger that appears after a structure scene has loaded, using a `SlidersHorizontal`-style icon and a tooltip label of `Settings`.

Implementation should prefer shadcn source components that match the job:

- A composed non-modal drawer surface for the right-side settings area, because the drawer should feel like a stable tool surface rather than a modal interruption.
- `Switch` for the single `Show boundary atom images` binary option.
- Existing `Button`, `Tooltip`, and `Separator` components for the trigger and simple grouping.

The drawer needs an accessible title and should behave as a non-blocking display surface: no dark page backdrop, no modal-feeling interruption, and no disabled placeholder controls for future bond settings. It should attach to the right edge and span the full viewport height, with an internally scrollable content area and expand/retract buttons aligned at the same viewport position.

### Settings drawer layout participates in preview safe areas

The preview should reserve a stable right-side margin for the settings region whether the Settings drawer is open or closed. The crystal should stay framed inside that stable available workspace, and the drawer may overlay part of the right side of the preview. The drawer surface can be slightly translucent or blurred, but its text and controls should sit on an effectively opaque surface for reliable readability over any crystal colors.

## Risks / Trade-offs

- Boundary tolerance may classify near-boundary atoms incorrectly → keep the tolerance small, centralize it in scene-building code, and test exact 0, near 1, face, edge, and corner cases.
- More atom instances can affect layout and legend logic → keep summary counts canonical and derive legend entries from canonical sites or first canonical instances.
- A shadcn `Sheet` may default to modal behavior → compose a restrained right drawer with the same visual language instead of inheriting modal behavior.
- The first panel has only one setting → keep it visually small and useful, so it feels like the beginning of the display system rather than an empty settings area.

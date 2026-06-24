## Context

The current preview loads a structure file, returns atoms plus the unit-cell frame, and renders them in a full-window Three.js scene. Periodic cell-boundary atom images already exist as renderable atom instances, but they are only marked with a single periodic-image flag and were controlled from the right-side drawer before this change.

This change adds bonds as the first real scene component beyond atoms and the cell frame. It also establishes the left-side tab panel that will eventually hold common figure controls. The Python backend remains responsible for structure analysis; the browser renders and filters the scene it receives.

## Goals / Non-Goals

**Goals:**

- Generate visual bond data in Python with pymatgen, defaulting to CrystalNN.
- Distinguish periodic image atoms by why they are displayed: boundary closure, one-hop bonded atom display, or both.
- Return a scene superset that lets the browser toggle cell-boundary atoms and one-hop bonded atoms locally.
- Render bonds as light-gray cylinders using the same material family as atom spheres.
- Add a second left floating card with `Camera`, `Display`, `Style`, and `Export` tabs, defaulting to `Display`.
- Move high-frequency component controls to the left panel and keep the right drawer for advanced settings.
- Keep parse errors and analysis warnings visually consistent through a shared alert component.

**Non-Goals:**

- Polyhedra generation or rendering. The `Polyhedra` row appears only as a disabled layout anchor.
- Custom cutoff tables, per-element bond editing, or manual bond editing.
- Moving the existing reset, lock, and zoom rail into the tab panel.
- Implementing figure export or style controls.

## Decisions

### Scene Data Model

The scene response will continue to contain renderable atom instances, but each atom instance will gain image-reason metadata. Canonical atoms have no image reasons. Boundary atom images include `boundary`; one-hop bonded atom images include `bonded`; an atom image can include both reasons.

Bond records remain semantic, not just raw line segments. A bond identifies both endpoint atom instances or enough site/image information to resolve those endpoints in the browser. This keeps periodic bonds understandable and avoids long fake bonds across the cell.

The backend will return a display-ready superset:

- canonical atoms;
- cell-boundary atom images;
- one-hop bonded atom images from canonical atoms;
- one-hop bonded atom images from cell-boundary atoms;
- bonds whose endpoints are part of that superset.

The browser filters this superset according to component state. Toggling `Cell-boundary atoms` or `One-hop bonded atoms` does not re-upload the file.

### Bond Analysis

CrystalNN is the default bond algorithm because it is pymatgen-native and fits the project decision that materials analysis belongs in Python. The right drawer will expose a small selector for other supported pymatgen neighbor algorithms. The first version does not expose custom parameters.

Changing the bond algorithm regenerates the scene by re-uploading the current file with analysis settings. This avoids adding backend session state while preserving the current rule that uploaded structure data is not persisted. Component visibility state remains local and is preserved across algorithm changes.

Bond analysis is non-fatal. If parsing succeeds but bond analysis fails, the API returns the atom/cell scene and a warning instead of failing the whole preview.

### Component Controls

The new left panel is a separate floating card below the structure summary card, aligned to the same width. It uses shadcn Tabs inside the card. The active tab shows icon plus full label; inactive tabs show icons with tooltips. The default tab is `Display`.

`Display` contains:

- `Atoms`, `Unit cell`, `Bonds`, and disabled `Polyhedra` checkboxes.
- `Images`: `Cell-boundary atoms` and `One-hop bonded atoms` switches.

All visible components are independent. Empty scenes are allowed. `Atoms` controls all atom spheres, including cell-boundary atoms and one-hop bonded atoms; `Bonds` can remain visible while atom spheres are hidden. `Unit cell` only controls the frame. Bonds render when both endpoint atom instances are visible; their visibility is not blocked by a hidden image category when neither endpoint depends on that category.

Local filtering does not change the loaded scene used for camera fit and layout. Toggling `Cell-boundary atoms` or `One-hop bonded atoms` changes the rendered subset but must not renormalize the unit-cell visual scale.

`Camera`, `Style`, and `Export` tabs are present as reserved pages with short empty-state text. They have controlled heights and no fake controls. The panel height follows active tab content with a short transition and no internal scrolling.

### Advanced Settings

The right drawer is renamed `Advanced Settings`. It keeps rotation mode and adds bond algorithm selection. It no longer owns cell-boundary atom visibility.

### Rendering

Bonds render as light-gray single-color cylinders. They use the same material language as atoms and a thicker fixed first-version radius. Cylinders can run center-to-center; atom spheres cover bond ends. Style controls for bond radius, color mode, and material presets are deferred.

## Risks / Trade-offs

- Bond algorithms can be slow or noisy for some structures -> Keep analysis non-fatal and expose a small algorithm selector before adding custom parameters.
- Returning a scene superset can increase response size -> Limit bonded images to one hop and do not recursively expand from newly added bonded atoms.
- Local filtering can become confusing if image reasons are too coarse -> Use explicit image reasons instead of a single periodic-image boolean.
- Four tabs with three reserved pages could feel empty -> Keep reserved pages visually quiet and do not add disabled fake controls.
- Animated panel height can be fiddly -> Keep tab content heights modest and use a short transition; avoid internal scrolling in the common panel.

## ADDED Requirements

### Requirement: Camera tab provides crystal-aware direction controls

The frontend SHALL replace the reserved `Camera` tab content with crystal-aware camera controls after a valid structure scene is loaded. The tab SHALL expose a `Primary direction` tab control with `Outward` and `Upward`, SHALL default to `Outward`, SHALL expose a live Roll control, and SHALL expose precise vector input inside a collapsed `Vectors` section. The controls SHALL use the existing common-controls panel styling, including tab-like segmented controls and existing numeric input styling.

#### Scenario: Show implemented Camera tab controls

- **WHEN** a structure scene has loaded successfully and the user opens `Camera`
- **THEN** the tab shows a `Primary direction` control with `Outward` and `Upward`
- **AND** `Outward` is selected by default
- **AND** the tab shows a Roll control
- **AND** the tab shows a collapsed `Vectors` section
- **AND** the tab does not show a reserved-state message

#### Scenario: Switch primary direction without rotating the preview

- **WHEN** the user switches `Primary direction` between `Upward` and `Outward`
- **THEN** the current preview orientation remains visually unchanged
- **AND** subsequent gizmo clicks and Roll edits use the newly selected primary direction

### Requirement: Crystal camera defaults use VESTA-like direct and reciprocal directions

The frontend SHALL initialize and reset loaded previews to a reproducible crystal camera pose with `Primary direction = Outward`, `Outward = c`, `Upward = b*`, and `Roll = 0°`. The frontend SHALL derive the rendered Three.js camera orientation from these crystal-direction controls and SHALL continue to expose the live rendered pose for export through the existing camera-pose snapshot boundary.

#### Scenario: Load scene with VESTA-like camera default

- **WHEN** a structure scene loads successfully
- **THEN** the preview uses `Outward = c`
- **AND** the preview uses `Upward = b*`
- **AND** the Roll control shows `0°`
- **AND** the zoom control shows 100%

#### Scenario: Export follows crystal camera orientation

- **WHEN** the user adjusts the crystal camera controls and then exports a figure
- **THEN** the exported figure uses the current preview orientation
- **AND** the export path does not need to read the Camera tab input draft state

### Requirement: Roll uses a VESTA-like reproducible anchor

The frontend SHALL define Roll around the current primary direct-lattice direction. For `Roll = 0°`, the frontend SHALL choose the first usable reciprocal secondary direction from `c*`, then `b*`, then `a*`, after projecting the candidate onto the plane perpendicular to the primary direction. Changing Roll SHALL rotate the secondary reciprocal direction around the primary direct direction. Applying a manual secondary vector SHALL update Roll to the nearest equivalent signed angle.

#### Scenario: Roll anchor follows VESTA-like fallback order

- **WHEN** the primary direct direction is `a` or `b`
- **THEN** `Roll = 0°` uses `c*` as the secondary reciprocal direction
- **WHEN** the primary direct direction is `c`
- **THEN** `Roll = 0°` uses `b*` as the secondary reciprocal direction

#### Scenario: Roll edits are live

- **WHEN** the user changes the Roll control
- **THEN** the preview orientation updates immediately
- **AND** the primary direct direction remains fixed
- **AND** the secondary reciprocal direction changes according to the Roll angle

### Requirement: Vectors editor batch-applies direct and reciprocal coefficients

The `Vectors` section SHALL be collapsed by default. When expanded, it SHALL show `Upward` and `Outward` semantic rows with the selected primary row first. The row matching the selected primary direction SHALL use direct basis labels `a`, `b`, and `c`; the other row SHALL use reciprocal basis labels `a*`, `b*`, and `c*`. Switching primary direction SHALL put the newly selected primary row first and update basis labels. Editing vector fields SHALL create a draft that does not rotate the preview until the user applies all vector fields together.

#### Scenario: Expand vectors in Upward primary mode

- **GIVEN** `Primary direction` is `Upward`
- **WHEN** the user expands `Vectors`
- **THEN** the `Upward` row shows coefficients for `a`, `b`, and `c`
- **AND** the `Outward` row shows coefficients for `a*`, `b*`, and `c*`
- **AND** the `Upward` row is first

#### Scenario: Expand vectors in Outward primary mode

- **GIVEN** `Primary direction` is `Outward`
- **WHEN** the user expands `Vectors`
- **THEN** the `Outward` row shows coefficients for `a`, `b`, and `c`
- **AND** the `Upward` row shows coefficients for `a*`, `b*`, and `c*`
- **AND** the `Outward` row is first

#### Scenario: Draft edits do not rotate until apply

- **WHEN** the user edits one or more vector fields
- **THEN** the preview orientation does not change immediately
- **WHEN** the user applies the vector draft
- **THEN** the preview orientation updates from the six submitted coefficients as one operation
- **AND** Roll updates to match the applied secondary direction

#### Scenario: Vector display normalizes coefficients

- **WHEN** the frontend displays vector coefficients derived from the current camera orientation
- **THEN** the displayed vector is normalized so the maximum absolute coefficient is 1
- **AND** coefficients close to simple integers are snapped for display

### Requirement: Orientation gizmo axes can apply the primary direction

The orientation gizmo SHALL allow single-click axis alignment for loaded previews. Hovering `a`, `b`, or `c` SHALL visually brighten that axis and use a pointer cursor. Clicking an axis SHALL apply that direct axis to the selected primary direction. The gizmo SHALL NOT require double-click, SHALL NOT show tooltips for these axis actions, and SHALL NOT keep a persistent active axis highlight.

#### Scenario: Hover highlights clickable axis

- **WHEN** the pointer hovers over a gizmo axis label or shaft
- **THEN** that axis brightens
- **AND** the cursor indicates that the axis is clickable

#### Scenario: Click axis in Upward primary mode

- **GIVEN** `Primary direction` is `Upward`
- **WHEN** the user clicks the gizmo `c` axis
- **THEN** the preview updates so direct `c` is the screen-up direction
- **AND** the secondary outward direction is resolved from the current camera state or the VESTA-like fallback

#### Scenario: Click axis in Outward primary mode

- **GIVEN** `Primary direction` is `Outward`
- **WHEN** the user clicks the gizmo `a` axis
- **THEN** the preview updates so direct `a` is the screen-outward direction
- **AND** the secondary upward direction is resolved from the current camera state or the VESTA-like fallback

## MODIFIED Requirements

### Requirement: Browser preview renders atoms, bonds, and unit cell

The frontend SHALL render the returned scene as a full-workspace Three.js preview with atoms, bonds, polyhedra, and the unit cell. The preview SHALL initialize loaded scenes with a reproducible VESTA-like orthographic camera pose using `Outward = c`, `Upward = b*`, and `Roll = 0°`; SHALL allow bounded interactive rotation and zoom through the existing view-control rail; and SHALL use local component state to control whether atoms, bonds, polyhedra, unit-cell frame, cell-boundary atom images, and one-hop bonded atom images are visible.

#### Scenario: Render a successful scene

- **WHEN** the frontend receives a successful structure scene response
- **THEN** the full workspace canvas renders visible atom geometry when the Atoms component is enabled
- **AND** it renders the unit-cell frame for the supplied cell when the Unit cell component is enabled
- **AND** it renders bond geometry when the Bonds component is enabled and the scene contains visible bond records
- **AND** it renders polyhedron geometry when the Polyhedra component is enabled and the scene contains visible polyhedron records
- **AND** it frames the scene with `Outward = c`, `Upward = b*`, and `Roll = 0°`

#### Scenario: Keep high-frequency display controls in the left panel

- **WHEN** the structure preview is displayed
- **THEN** common component visibility controls are available from the left tab panel
- **AND** the left structure card remains focused on file status and compact structure facts

### Requirement: Preview can lock and reset view interaction

The frontend SHALL provide a canvas interaction lock and a reset control for loaded structure previews. Locking SHALL disable mouse gesture changes to the canvas, including drag rotation and wheel zoom, while leaving explicit rail and settings controls available. Reset SHALL restore the VESTA-like crystal camera default, 100% zoom, and centered framing.

#### Scenario: Lock disables canvas gestures

- **WHEN** the user enables the interaction lock
- **THEN** mouse drag gestures do not rotate the preview
- **AND** mouse wheel gestures do not change the zoom percentage

#### Scenario: Explicit controls remain available while locked

- **WHEN** the interaction lock is enabled
- **THEN** the user can still use the reset control
- **AND** the user can still change zoom through the rail controls
- **AND** the user can still change interaction mode in the Advanced Settings drawer

#### Scenario: Reset restores VESTA-like crystal camera default

- **WHEN** the user activates the reset control after rotating or zooming the preview
- **THEN** the preview returns to `Primary direction = Outward`
- **AND** the preview returns to `Outward = c`, `Upward = b*`, and `Roll = 0°`
- **AND** the zoom value returns to 100%
- **AND** the preview target returns to centered framing

### Requirement: Preview provides a left tab panel for common controls

The frontend SHALL show a second left floating card below the structure summary card after a valid scene is loaded. The card SHALL use tabs for `Camera`, `Display`, `Style`, and `Export`; SHALL default to `Display`; SHALL show the active tab with icon plus full label; and SHALL show inactive tabs as icon-only controls with accessible labels and tooltips. The panel height SHALL follow the active tab content with a short transition and SHALL NOT use internal scrolling for common controls.

#### Scenario: Show tab panel after scene load

- **WHEN** a structure scene loads successfully
- **THEN** the left tab panel appears below the structure summary card
- **AND** the `Display` tab is selected by default
- **AND** all four tabs are present

#### Scenario: Switch tabs

- **WHEN** the user selects a different tab
- **THEN** the active tab shows its icon and full label
- **AND** inactive tabs remain icon-only with accessible labels and tooltips
- **AND** the card height transitions to the selected tab content height

#### Scenario: Show implemented pages

- **WHEN** the user opens `Camera`, `Display`, `Style`, or `Export`
- **THEN** the tab shows implemented controls for that tab
- **AND** it does not show a reserved-state message for implemented controls

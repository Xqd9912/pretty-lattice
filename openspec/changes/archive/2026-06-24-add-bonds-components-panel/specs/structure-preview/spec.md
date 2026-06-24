## MODIFIED Requirements

### Requirement: Scene response contains only MVP preview data

The system SHALL return a scene contract containing unit-cell vectors, renderable atom instances, optional bond records, non-fatal analysis warnings, and a structure summary. Each atom instance SHALL include a stable ID, canonical site ID, element symbol, Cartesian position, fractional position, integer periodic image offset, periodic-image marker, image-reason metadata, radius, and color. Each bond record SHALL identify stable renderable endpoints in the returned scene and SHALL NOT require the browser to run crystallographic analysis. The scene response SHALL keep the structure summary atom count tied to canonical sites. The scene contract SHALL NOT include labels, measurement data, polyhedra records, or user-facing visual-control configuration.

#### Scenario: Build scene response from a parsed structure

- **WHEN** a backend-parsed structure is converted successfully
- **THEN** the scene response includes the supplied unit-cell vectors
- **AND** each atom instance includes ID, site ID, element, Cartesian position, fractional position, image offset, periodic-image marker, image-reason metadata, radius, and color fields
- **AND** bond records are included when bond analysis succeeds and finds renderable bonds

#### Scenario: Generate visual images for cell-boundary atoms

- **WHEN** a periodic 3D structure contains atoms on unit-cell faces, edges, or corners
- **THEN** the scene response includes visual periodic image instances needed to close the displayed unit cell
- **AND** those periodic image instances reference the same canonical site ID as their source atom
- **AND** those periodic image instances include `boundary` in their image-reason metadata

#### Scenario: Preserve canonical atom count

- **WHEN** the scene response includes periodic image atom instances
- **THEN** the structure summary atom count equals the number of canonical structure sites
- **AND** it does not count visual periodic image instances as additional structure atoms

#### Scenario: Exclude deferred scene features

- **WHEN** the frontend receives a scene response for this change
- **THEN** it can render atoms, bonds, and the unit cell without label, measurement, or polyhedra records
- **AND** it does not receive user-facing visual-control configuration fields

### Requirement: Browser preview renders atoms and unit cell

The frontend SHALL render the returned scene as a full-workspace Three.js preview with atoms, bonds, and the unit cell. The preview SHALL initialize loaded scenes with a reproducible Standard c-up three-quarter orthographic view, SHALL allow bounded interactive rotation and zoom through the existing view-control rail, and SHALL use local component state to control whether atoms, bonds, unit-cell frame, cell-boundary atom images, and one-hop bonded atom images are visible.

#### Scenario: Render a successful scene

- **WHEN** the frontend receives a successful structure scene response
- **THEN** the full workspace canvas renders visible atom geometry when the Atoms component is enabled
- **AND** it renders the unit-cell frame for the supplied cell when the Unit cell component is enabled
- **AND** it renders bond geometry when the Bonds component is enabled and the scene contains visible bond records
- **AND** it frames the scene with the Standard c-up three-quarter view

#### Scenario: Keep high-frequency display controls in the left panel

- **WHEN** the structure preview is displayed
- **THEN** common component visibility controls are available from the left tab panel
- **AND** the left structure card remains focused on file status and compact structure facts

### Requirement: Interaction card follows the MVP frontend boundary

The frontend SHALL use a left floating structure card over the scene plus a separate left floating tab panel below it after a valid scene is loaded. The structure card SHALL show only implemented structure status: open file, file name, loading state, success summary, parse errors, and non-fatal analysis warnings. The tab panel SHALL contain common preview controls and SHALL NOT be merged into the structure summary card.

#### Scenario: Show successful preview status

- **WHEN** a structure preview has loaded successfully
- **THEN** the left floating structure card shows the file name and a compact structure summary
- **AND** the separate left tab panel appears below it
- **AND** the structure card does not show disabled placeholder actions

#### Scenario: Show parse error status

- **WHEN** a structure upload fails to parse
- **THEN** the left floating structure card shows the file name and parse error
- **AND** the scene area does not pretend that a valid structure is loaded
- **AND** the left tab panel does not appear

### Requirement: Preview provides a right-side settings drawer

The frontend SHALL provide a right-side Advanced Settings drawer for low-frequency preview settings after a structure scene is loaded. The drawer SHALL expand from and retract into a compact right-side settings trigger, SHALL attach to the right edge and span the full viewport height with an internally scrollable content area, SHALL remain visually consistent with the existing light UI, and SHALL expose rotation mode plus bond algorithm controls.

#### Scenario: Open settings drawer

- **GIVEN** a structure scene has loaded successfully
- **WHEN** the user opens the right-side settings trigger
- **THEN** the Advanced Settings drawer appears on the right side of the workspace
- **AND** the drawer includes an accessible title
- **AND** the drawer includes an interaction-mode control with Trackball and Orbit options
- **AND** the drawer includes a bond algorithm control
- **AND** the drawer uses a simple restrained opening motion

#### Scenario: Retract settings drawer

- **WHEN** the user activates the drawer's retract control
- **THEN** the Advanced Settings drawer retracts toward the right-side trigger
- **AND** the retracting motion is visually consistent with the opening motion
- **AND** the retract control is aligned with the compact settings trigger

#### Scenario: Keep common component controls out of advanced settings

- **WHEN** the Advanced Settings drawer is shown
- **THEN** it does not show component visibility controls for atoms, unit cell, bonds, polyhedra, cell-boundary atoms, or one-hop bonded atoms

### Requirement: Cell-boundary atom visibility can be toggled locally

The frontend SHALL default to showing periodic cell-boundary atom images when the loaded scene provides them. The `Cell-boundary atoms` switch in the left `Display` tab SHALL control whether atom instances marked with the `boundary` image reason participate in the visible scene, without changing the loaded scene response, canonical atom count, file state, preview fitting bounds, or backend state.

#### Scenario: Show cell-boundary atom images by default

- **WHEN** a periodic structure scene includes atom instances marked with the `boundary` image reason
- **THEN** the preview includes those atom instances in the visible scene by default

#### Scenario: Hide cell-boundary atom images

- **WHEN** the user turns off the `Cell-boundary atoms` switch
- **THEN** the preview excludes atom instances whose visibility depends on the cell-boundary atom image setting
- **AND** the structure summary atom count remains the canonical atom count
- **AND** the unit-cell visual scale remains based on the loaded scene rather than the filtered visible subset

#### Scenario: Re-show cell-boundary atom images

- **WHEN** the user turns the `Cell-boundary atoms` switch back on
- **THEN** the preview includes the cell-boundary atom image instances from the already-loaded scene
- **AND** the frontend does not re-upload the file to the API for this display-only change

## ADDED Requirements

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

#### Scenario: Show reserved pages

- **WHEN** the user opens `Camera`, `Style`, or `Export`
- **THEN** the tab shows a short reserved-state message
- **AND** it does not show disabled placeholder controls for features that are not implemented

### Requirement: Display tab controls visible scene components

The `Display` tab SHALL expose visible-component checkboxes for `Atoms`, `Unit cell`, `Bonds`, and `Polyhedra`, plus image switches for `Cell-boundary atoms` and `One-hop bonded atoms`. `Atoms`, `Unit cell`, `Bonds`, `Cell-boundary atoms`, and `One-hop bonded atoms` SHALL default to enabled. `Polyhedra` SHALL appear disabled and unchecked for layout continuity. The preview SHALL allow all enabled components to be turned off without forcing a non-empty scene.

#### Scenario: Toggle atom spheres

- **WHEN** the user turns off `Atoms`
- **THEN** the preview hides all atom sphere geometry, including canonical atoms, cell-boundary atoms, and one-hop bonded atoms
- **AND** bond geometry can remain visible when `Bonds` is enabled

#### Scenario: Toggle unit-cell frame

- **WHEN** the user turns off `Unit cell`
- **THEN** the preview hides the unit-cell frame
- **AND** cell-boundary atom images remain controlled only by the `Cell-boundary atoms` switch

#### Scenario: Toggle bonds

- **WHEN** the user turns off `Bonds`
- **THEN** the preview hides bond geometry
- **AND** atom and unit-cell visibility state remains unchanged

#### Scenario: Show disabled polyhedra row

- **WHEN** the `Display` tab is displayed in this change
- **THEN** it shows a disabled unchecked `Polyhedra` checkbox
- **AND** the preview does not render polyhedra

### Requirement: One-hop bonded atom visibility can be toggled locally

The frontend SHALL default to showing one-hop bonded atom images when the loaded scene provides them. The `One-hop bonded atoms` switch SHALL control whether atom instances and bonds that depend on one-hop bonded image display participate in the visible scene. The switch SHALL be independent from `Cell-boundary atoms`, SHALL NOT trigger a file re-upload, and SHALL NOT change the loaded scene used for camera fit and layout.

#### Scenario: Show one-hop bonded atoms by default

- **WHEN** the scene includes one-hop bonded atom image instances
- **THEN** the preview includes those atom instances and their bonds in the visible scene by default

#### Scenario: Hide one-hop bonded atoms

- **WHEN** the user turns off `One-hop bonded atoms`
- **THEN** the preview excludes one-hop bonded atom image instances
- **AND** it excludes bonds whose endpoints depend on those hidden instances
- **AND** the unit-cell visual scale remains based on the loaded scene rather than the filtered visible subset
- **AND** the frontend does not re-upload the file to the API

#### Scenario: Cell-boundary atoms and one-hop bonded atoms are independent

- **WHEN** the user changes either `Cell-boundary atoms` or `One-hop bonded atoms`
- **THEN** the other switch keeps its current state
- **AND** the visible scene is recomputed from the already-loaded scene response

### Requirement: Preview renders bonds as a light-gray structure component

The frontend SHALL render returned bond records as light-gray single-color cylinder geometry when the Bonds component is enabled and both endpoints are part of the visible scene. Bond cylinders SHALL use the same material family as atom spheres, SHALL use a thicker fixed first-version radius, and can extend from endpoint center to endpoint center.

#### Scenario: Render visible bonds

- **WHEN** the scene contains bond records and the Bonds component is enabled
- **THEN** the preview renders light-gray bond cylinders between visible endpoints
- **AND** atom spheres cover bond ends when atom spheres are visible

#### Scenario: Hide bonds with hidden endpoints

- **WHEN** a bond endpoint is excluded by local image filtering
- **THEN** the preview does not render that bond
- **AND** it does not render a long replacement bond across the unit cell

#### Scenario: Keep cell-boundary bonds without one-hop images

- **GIVEN** `Cell-boundary atoms` is enabled
- **AND** `One-hop bonded atoms` is disabled
- **WHEN** a returned bond has both endpoint atom instances visible through canonical or cell-boundary atom visibility
- **THEN** the preview renders that bond
- **AND** bond visibility is determined by visible endpoints rather than a hidden one-hop image category

### Requirement: Advanced settings can regenerate bonds with a selected algorithm

The frontend SHALL keep the current file object available while a scene is loaded. When the user changes the bond algorithm in Advanced Settings, the frontend SHALL re-upload the current file with the selected analysis setting, replace the scene with the regenerated response, and preserve local component visibility state.

#### Scenario: Change bond algorithm

- **WHEN** a scene is loaded and the user selects a different bond algorithm
- **THEN** the frontend re-requests the structure preview with the current file and selected algorithm
- **AND** the returned scene replaces the previous scene
- **AND** component visibility state remains unchanged

#### Scenario: Load a new file resets defaults

- **WHEN** the user loads a different structure file
- **THEN** the bond algorithm resets to CrystalNN
- **AND** component visibility resets to the default enabled states for atoms, unit cell, bonds, cell-boundary atoms, and one-hop bonded atoms

### Requirement: Preview presents parse errors and analysis warnings consistently

The frontend SHALL use a shared alert component for fatal parse errors and non-fatal analysis warnings. Parse errors SHALL remain destructive alerts in the left structure card and SHALL prevent a scene from loading. Non-fatal analysis warnings SHALL appear in the left structure card while preserving the successfully loaded scene.

#### Scenario: Show parse error alert

- **WHEN** structure parsing fails
- **THEN** the left structure card shows a destructive alert with the parse message
- **AND** no scene is rendered

#### Scenario: Show non-fatal analysis warning

- **WHEN** structure parsing succeeds but bond analysis returns a warning
- **THEN** the left structure card shows a non-destructive alert with the warning
- **AND** the preview still renders the available scene data

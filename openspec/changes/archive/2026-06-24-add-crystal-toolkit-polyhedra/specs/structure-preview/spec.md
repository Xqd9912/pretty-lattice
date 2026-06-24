## ADDED Requirements

### Requirement: Preview renders polyhedra as a translucent structure component

The frontend SHALL render returned polyhedron records as translucent surface geometry with edge outlines when the Polyhedra component is enabled and every atom instance referenced by the polyhedron hull is part of the visible scene. Polyhedra SHALL use the returned face indices and SHALL NOT calculate coordination environments or hull topology in the browser.

#### Scenario: Render visible polyhedra

- **WHEN** the scene contains polyhedron records and the Polyhedra component is enabled
- **THEN** the preview renders translucent polyhedron surfaces from the returned hull atoms and face indices
- **AND** it renders edge outlines for the visible polyhedra
- **AND** atom spheres and bond cylinders can remain visible over the translucent surfaces

#### Scenario: Hide polyhedra with hidden hull atoms

- **WHEN** a polyhedron references an atom instance excluded by local image filtering
- **THEN** the preview does not render that polyhedron
- **AND** it does not render a partial replacement shell

#### Scenario: Keep polyhedra independent from atom sphere visibility

- **WHEN** the user turns off `Atoms` while `Polyhedra` remains enabled
- **THEN** the preview hides atom sphere geometry
- **AND** visible polyhedron surfaces can remain rendered

## MODIFIED Requirements

### Requirement: Scene response contains only MVP preview data

The system SHALL return a scene contract containing unit-cell vectors, renderable atom instances, optional bond records, optional polyhedron records, non-fatal analysis warnings, and a structure summary. Each atom instance SHALL include a stable ID, canonical site ID, element symbol, Cartesian position, fractional position, integer periodic image offset, periodic-image marker, image-reason metadata, radius, and color. Each bond record SHALL identify stable renderable endpoints in the returned scene and SHALL NOT require the browser to run crystallographic analysis. Each polyhedron record SHALL identify a stable center atom, ordered hull atom IDs, triangular face indices, color, and visibility-dependency metadata, and SHALL NOT require the browser to run crystallographic analysis, hull generation, or material-style resolution. The scene response SHALL keep the structure summary atom count tied to canonical sites. The scene contract SHALL NOT include labels, measurement data, or user-facing visual-control configuration.

#### Scenario: Build scene response from a parsed structure

- **WHEN** a backend-parsed structure is converted successfully
- **THEN** the scene response includes the supplied unit-cell vectors
- **AND** each atom instance includes ID, site ID, element, Cartesian position, fractional position, image offset, periodic-image marker, image-reason metadata, radius, and color fields
- **AND** bond records are included when bond analysis succeeds and finds renderable bonds
- **AND** polyhedron records are included when polyhedra analysis succeeds and finds renderable polyhedra

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
- **THEN** it can render atoms, bonds, polyhedra, and the unit cell without label or measurement records
- **AND** it does not receive user-facing visual-control configuration fields

### Requirement: Browser preview renders atoms, bonds, and unit cell

The frontend SHALL render the returned scene as a full-workspace Three.js preview with atoms, bonds, polyhedra, and the unit cell. The preview SHALL initialize loaded scenes with a reproducible Standard c-up three-quarter orthographic view, SHALL allow bounded interactive rotation and zoom through the existing view-control rail, and SHALL use local component state to control whether atoms, bonds, polyhedra, unit-cell frame, cell-boundary atom images, and one-hop bonded atom images are visible.

#### Scenario: Render a successful scene

- **WHEN** the frontend receives a successful structure scene response
- **THEN** the full workspace canvas renders visible atom geometry when the Atoms component is enabled
- **AND** it renders the unit-cell frame for the supplied cell when the Unit cell component is enabled
- **AND** it renders bond geometry when the Bonds component is enabled and the scene contains visible bond records
- **AND** it renders polyhedron geometry when the Polyhedra component is enabled and the scene contains visible polyhedron records
- **AND** it frames the scene with the Standard c-up three-quarter view

#### Scenario: Keep high-frequency display controls in the left panel

- **WHEN** the structure preview is displayed
- **THEN** common component visibility controls are available from the left tab panel
- **AND** the left structure card remains focused on file status and compact structure facts

### Requirement: Display tab controls visible scene components

The `Display` tab SHALL expose visible-component checkboxes for `Atoms`, `Unit cell`, `Bonds`, and `Polyhedra`, plus image switches for `Cell-boundary atoms` and `One-hop bonded atoms`. `Atoms`, `Unit cell`, `Bonds`, `Cell-boundary atoms`, and `One-hop bonded atoms` SHALL default to enabled. `Polyhedra` SHALL default to enabled when the loaded scene includes polyhedron records and SHALL appear disabled and unchecked only when the loaded scene has no polyhedron records. The preview SHALL allow all enabled components to be turned off without forcing a non-empty scene.

#### Scenario: Toggle atom spheres

- **WHEN** the user turns off `Atoms`
- **THEN** the preview hides all atom sphere geometry, including canonical atoms, cell-boundary atoms, and one-hop bonded atoms
- **AND** bond and polyhedron geometry can remain visible when their components are enabled

#### Scenario: Toggle unit-cell frame

- **WHEN** the user turns off `Unit cell`
- **THEN** the preview hides the unit-cell frame
- **AND** cell-boundary atom images remain controlled only by the `Cell-boundary atoms` switch

#### Scenario: Toggle bonds

- **WHEN** the user turns off `Bonds`
- **THEN** the preview hides bond geometry
- **AND** atom, polyhedron, and unit-cell visibility state remains unchanged

#### Scenario: Toggle polyhedra

- **WHEN** the loaded scene includes polyhedron records and the user turns off `Polyhedra`
- **THEN** the preview hides polyhedron geometry
- **AND** atom, bond, and unit-cell visibility state remains unchanged

#### Scenario: Show disabled polyhedra row without polyhedron data

- **WHEN** the loaded scene has no polyhedron records
- **THEN** the `Display` tab shows a disabled unchecked `Polyhedra` checkbox
- **AND** the preview does not render polyhedra

### Requirement: Advanced settings can regenerate bonds with a selected algorithm

The frontend SHALL keep the current file object available while a scene is loaded. When the user changes the bond algorithm in Advanced Settings, the frontend SHALL re-upload the current file with the selected analysis setting, replace the scene with the regenerated response, and preserve local component visibility state. The regenerated scene SHALL use the selected algorithm for both bond and polyhedra analysis.

#### Scenario: Change bond algorithm

- **WHEN** a scene is loaded and the user selects a different bond algorithm
- **THEN** the frontend re-requests the structure preview with the current file and selected algorithm
- **AND** the returned scene replaces the previous scene
- **AND** the returned bonds and polyhedra are generated from the selected algorithm
- **AND** component visibility state remains unchanged

#### Scenario: Load a new file resets defaults

- **WHEN** the user loads a different structure file
- **THEN** the bond algorithm resets to CrystalNN
- **AND** component visibility resets to the default enabled states for atoms, unit cell, bonds, polyhedra when available, cell-boundary atoms, and one-hop bonded atoms

### Requirement: Preview presents parse errors and analysis warnings consistently

The frontend SHALL use a shared alert component for fatal parse errors and non-fatal analysis warnings. Parse errors SHALL remain destructive alerts in the left structure card and SHALL prevent a scene from loading. Non-fatal analysis warnings from bond or polyhedra analysis SHALL appear in the left structure card while preserving the successfully loaded scene.

#### Scenario: Show parse error alert

- **WHEN** structure parsing fails
- **THEN** the left structure card shows a destructive alert with the parse message
- **AND** no scene is rendered

#### Scenario: Show non-fatal analysis warning

- **WHEN** structure parsing succeeds but bond or polyhedra analysis returns a warning
- **THEN** the left structure card shows a non-destructive alert with the warning
- **AND** the preview still renders the available scene data

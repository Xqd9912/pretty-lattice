## Purpose

Define the local GUI flow for loading a structure file, parsing it through the
Python API, and returning the minimal scene data needed for the first browser
preview.
## Requirements
### Requirement: User can open a local structure file

The system SHALL provide a desktop GUI file-open flow inside the left floating
interaction card. The selected file SHALL be uploaded to the local Python API
for parsing, and the app SHALL NOT require a command-line file path for this
MVP flow.

#### Scenario: Open a local structure file from the GUI

- **WHEN** the user selects a local structure file from the GUI
- **THEN** the frontend uploads that file to the local API
- **AND** the interaction card shows the selected file name and a loading state

#### Scenario: File data is not persisted

- **WHEN** the local API receives an uploaded structure file
- **THEN** it parses the file for the current request
- **AND** it does not create a recent-file list or save the uploaded structure as
  project state

### Requirement: Python API parses backend-supported CIF structures

The system SHALL parse uploaded periodic structure files through the Python
backend structure parser and convert successful parses into a structure preview
response. CIF files SHALL be the committed parser and scene fixture baseline.
Parse failures SHALL return a clear API error that the frontend can display.

#### Scenario: Parse a CIF fixture

- **WHEN** the API receives a valid CIF fixture
- **THEN** it returns a successful structure preview response
- **AND** the response includes unit-cell vectors and atom records

#### Scenario: Reject an invalid structure file

- **WHEN** the API cannot parse the uploaded file through the backend structure
  parser
- **THEN** it returns an error response with a clear parse message
- **AND** the frontend displays that message in the interaction card

### Requirement: Scene response contains only MVP preview data

The system SHALL return a scene contract containing unit-cell vectors and renderable atom instances. Each atom instance SHALL include a stable ID, canonical site ID, element symbol, Cartesian position, fractional position, integer periodic image offset, periodic-image marker, radius, and color. The scene response SHALL keep the structure summary atom count tied to canonical sites. The scene contract SHALL NOT include bonds, labels, measurement data, or user-facing visual-control configuration.

#### Scenario: Build scene response from a parsed structure

- **WHEN** a backend-parsed structure is converted successfully
- **THEN** the scene response includes the supplied unit-cell vectors
- **AND** each atom instance includes ID, site ID, element, Cartesian position, fractional position, image offset, periodic-image marker, radius, and color fields

#### Scenario: Generate visual images for boundary atoms

- **WHEN** a periodic 3D structure contains atoms on unit-cell faces, edges, or corners
- **THEN** the scene response includes visual periodic image instances needed to close the displayed unit cell
- **AND** those periodic image instances reference the same canonical site ID as their source atom

#### Scenario: Preserve canonical atom count

- **WHEN** the scene response includes periodic image atom instances
- **THEN** the structure summary atom count equals the number of canonical structure sites
- **AND** it does not count visual periodic image instances as additional structure atoms

#### Scenario: Exclude deferred scene features

- **WHEN** the frontend receives an MVP scene response
- **THEN** it can render atoms and the unit cell without bond records
- **AND** it does not receive labels, measurement data, or visual-control configuration fields

### Requirement: Element radius and color use internal bundled defaults

The system SHALL resolve atom radius from an internal element registry and atom
color from a separate internal colormap registry. The first preview SHALL use
`uniform_radius` for atom size and the bundled VESTA-compatible colormap as an
internal default.

#### Scenario: Resolve atom radius and color

- **WHEN** the scene builder creates an atom record for a known element
- **THEN** it resolves the atom radius from bundled element data
- **AND** it resolves the atom color from the active internal colormap

#### Scenario: Keep data registries separate

- **WHEN** element data and colormap data are loaded
- **THEN** element radius records and element color records come from separate
  bundled data files
- **AND** the frontend does not expose a colormap selector

### Requirement: Browser preview renders atoms and unit cell

The frontend SHALL render the returned scene as a full-workspace Three.js preview with atoms and the unit cell. The preview SHALL use fixed internal camera and visual defaults for this slice, while allowing the right-side Settings drawer to control whether periodic boundary image atom instances are visible.

#### Scenario: Render a successful scene

- **WHEN** the frontend receives a successful structure scene response
- **THEN** the full workspace canvas renders visible atom geometry
- **AND** it renders the unit-cell frame for the supplied cell

#### Scenario: Keep display controls in the right drawer

- **WHEN** the structure preview is displayed
- **THEN** settings are available from the right-side Settings drawer
- **AND** the left structure card remains focused on file status and compact structure facts

### Requirement: Browser preview shows an element legend

The frontend SHALL show a read-only element legend when a valid structure scene
is loaded. The legend SHALL derive one entry per unique element from the loaded
scene atoms, using the first occurrence order from the scene. Each legend entry
SHALL show the element symbol in the app's sans font at regular weight and a
fixed-size sphere marker using that element's scene color. The legend container
SHALL use a capsule shape.

#### Scenario: Show legend for a loaded scene

- **WHEN** the frontend receives a successful structure scene containing atoms
  for multiple elements
- **THEN** the preview shows one legend entry per unique element
- **AND** each entry shows the element symbol and the corresponding atom color

#### Scenario: Preserve element ordering

- **WHEN** the scene atoms contain repeated elements
- **THEN** the legend lists each element only once
- **AND** the legend order follows the first time each element appears in the
  scene atom list

#### Scenario: Hide legend without a valid scene

- **WHEN** no structure is loaded or the current upload failed to parse
- **THEN** the preview does not show an element legend

### Requirement: Preview layout preserves full-bleed canvas with overlay safe areas

The frontend SHALL keep the structure preview canvas full-window and SHALL NOT draw a visible canvas frame. When a scene is loaded, the preview layout SHALL reserve screen-space safe areas for the left structure UI, the bottom element legend, and a stable right-side margin sized for the settings drawer region. Opening or closing the Settings drawer SHALL NOT change the preview safe area; the drawer may cover part of the preview. The bottom legend SHALL be horizontally centered within the available preview area after those stable safe areas are applied.

#### Scenario: Canvas remains full-window

- **WHEN** the structure preview is displayed
- **THEN** the canvas fills the preview workspace
- **AND** the UI does not add a visible border or framed image container around the canvas

#### Scenario: Structure avoids overlay regions

- **WHEN** a loaded scene is framed for preview
- **THEN** the primary structure view is positioned within the available preview area outside the active overlay safe areas

#### Scenario: Right drawer does not resize preview safe area

- **WHEN** the Settings drawer is open
- **THEN** the preview safe-area calculation remains the same as when the drawer is closed
- **AND** the drawer may overlay part of the right side of the preview

#### Scenario: Legend aligns to available preview area

- **WHEN** a loaded scene shows the element legend
- **THEN** the legend's horizontal position is centered within the available preview area outside the active left and right safe areas

### Requirement: Legend is part of future figure export semantics

The system SHALL treat a visible element legend as figure content for future
GUI exports. Export implementation is outside this change, but later export
work SHALL compose the legend relative to an explicit export frame rather than
using the browser window size as the final figure boundary.

#### Scenario: Export design preserves visible legend intent

- **WHEN** a future GUI export is implemented
- **THEN** the export behavior includes the visible element legend by default
- **AND** the legend position is resolved relative to the export figure frame

### Requirement: Interaction card follows the MVP frontend boundary

The frontend SHALL use a single left floating interaction card over the scene.
The card SHALL show only implemented interactions and relevant status: open
file, file name, loading state, success summary, and parse errors.

#### Scenario: Show successful preview status

- **WHEN** a structure preview has loaded successfully
- **THEN** the left floating card shows the file name and a compact structure
  summary
- **AND** it does not show disabled placeholder actions

#### Scenario: Show parse error status

- **WHEN** a structure upload fails to parse
- **THEN** the left floating card shows the file name and parse error
- **AND** the scene area does not pretend that a valid structure is loaded

### Requirement: Tests use local CIF fixtures and avoid generated preview artifacts

The system SHALL use local CIF fixtures as tests for file parsing and scene
conversion. Generated preview images SHALL NOT be committed as examples or
golden images for this migration.

#### Scenario: Fixture-backed parser and scene tests

- **WHEN** the automated tests run
- **THEN** they cover the committed CIF fixture matrix
- **AND** they validate the returned scene structure rather than comparing
  golden image files

### Requirement: Preview provides a right-side settings drawer

The frontend SHALL provide a right-side Settings drawer for low-frequency preview settings after a structure scene is loaded. The drawer SHALL expand from and retract into a compact right-side settings trigger, SHALL attach to the right edge and span the full viewport height with an internally scrollable content area, SHALL remain visually consistent with the existing light UI, and SHALL currently expose a `Show boundary atom images` switch as its only display option.

#### Scenario: Open settings drawer

- **GIVEN** a structure scene has loaded successfully
- **WHEN** the user opens the right-side settings trigger
- **THEN** the Settings drawer appears on the right side of the workspace
- **AND** the drawer includes an accessible title and the `Show boundary atom images` switch
- **AND** the drawer uses a simple restrained opening motion

#### Scenario: Retract settings drawer

- **WHEN** the user activates the drawer's retract control
- **THEN** the Settings drawer retracts toward the right-side trigger
- **AND** the retracting motion is visually consistent with the opening motion
- **AND** the retract control is aligned with the compact settings trigger

#### Scenario: Keep future settings absent until implemented

- **WHEN** the Settings drawer is shown for this change
- **THEN** it does not show disabled placeholder controls for bonded outside atoms, supercells, colors, lighting, or camera settings

### Requirement: Boundary atom visibility can be toggled locally

The frontend SHALL default to showing periodic boundary atom images when the loaded scene provides them. The `Show boundary atom images` switch SHALL control whether periodic image atom instances are rendered, without changing the loaded scene response, canonical atom count, file state, or backend state.

#### Scenario: Show boundary atom images by default

- **WHEN** a periodic structure scene includes atom instances marked as periodic images
- **THEN** the preview renders canonical atom instances and periodic boundary image instances by default

#### Scenario: Hide boundary atom images

- **WHEN** the user turns off the `Show boundary atom images` switch
- **THEN** the preview renders only canonical atom instances
- **AND** the structure summary atom count remains the canonical atom count

#### Scenario: Re-show boundary atom images

- **WHEN** the user turns the `Show boundary atom images` switch back on
- **THEN** the preview renders the periodic boundary image instances from the already-loaded scene
- **AND** the frontend does not re-upload the file to the API for this display-only change

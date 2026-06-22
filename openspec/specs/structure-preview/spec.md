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

### Requirement: Python API parses ASE-readable structures

The system SHALL parse uploaded structure files with ASE without enforcing a
project-local file-format whitelist, and convert successful parses into a
structure preview response. CIF and POSCAR-style files SHALL remain covered as
the MVP fixture baseline. Parse failures SHALL return a clear API error that
the frontend can display.

#### Scenario: Parse a CIF fixture

- **WHEN** the API receives a valid CIF fixture
- **THEN** it returns a successful structure preview response
- **AND** the response includes unit-cell vectors and atom records

#### Scenario: Parse a POSCAR fixture

- **WHEN** the API receives a valid POSCAR-style fixture
- **THEN** it returns a successful structure preview response
- **AND** the response includes unit-cell vectors and atom records

#### Scenario: Parse an additional ASE-readable format

- **WHEN** the parser receives a valid ASE-readable structure outside the CIF
  and POSCAR fixture baseline
- **THEN** it returns an ASE atoms object without requiring a project-local
  whitelist entry for that file type

#### Scenario: Reject an invalid structure file

- **WHEN** the API cannot parse the uploaded file with ASE
- **THEN** it returns an error response with a clear parse message
- **AND** the frontend displays that message in the interaction card

### Requirement: Scene response contains only MVP preview data

The system SHALL return a scene contract containing unit-cell vectors and atoms.
Each atom SHALL include a stable ID, element symbol, Cartesian position, radius,
and color. The MVP scene contract SHALL NOT include bonds, labels, measurement
data, or user-facing visual-control settings.

#### Scenario: Build scene response from a parsed structure

- **WHEN** an ASE-parsed structure is converted successfully
- **THEN** the scene response includes the supplied unit-cell vectors
- **AND** each atom record includes ID, element, Cartesian position, radius, and
  color fields

#### Scenario: Exclude deferred scene features

- **WHEN** the frontend receives an MVP scene response
- **THEN** it can render atoms and the unit cell without bond records
- **AND** it does not receive labels, measurement data, or visual-control
  configuration fields

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

The frontend SHALL render the returned scene as a full-workspace Three.js
preview with atoms and the unit cell. The preview SHALL use fixed internal
camera and visual defaults for this slice.

#### Scenario: Render a successful scene

- **WHEN** the frontend receives a successful structure scene response
- **THEN** the full workspace canvas renders visible atom geometry
- **AND** it renders the unit-cell frame for the supplied cell

#### Scenario: No visual controls are shown

- **WHEN** the structure preview is displayed
- **THEN** the UI does not show controls for view, size, radius, color,
  background, or lighting

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

The frontend SHALL keep the structure preview canvas full-window and SHALL NOT
draw a visible canvas frame. When a scene is loaded, the preview layout SHALL
reserve screen-space safe areas for the left interaction card and the bottom
element legend so the primary structure view is not intentionally placed beneath
those overlays.
The bottom legend SHALL be horizontally centered within the available preview
area after those safe areas are applied.

#### Scenario: Canvas remains full-window

- **WHEN** the structure preview is displayed
- **THEN** the canvas fills the preview workspace
- **AND** the UI does not add a visible border or framed image container around
  the canvas

#### Scenario: Structure avoids overlay regions

- **WHEN** a loaded scene is framed for preview
- **THEN** the primary structure view is positioned within the available preview
  area outside the left card and bottom legend safe areas

#### Scenario: Legend aligns to available preview area

- **WHEN** a loaded scene shows the element legend
- **THEN** the legend's horizontal position is centered within the available
  preview area outside the left card and right margin safe areas

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

### Requirement: Tests use copied fixtures and avoid generated preview artifacts

The system SHALL use selected archived 2D project fixtures as local tests for
file parsing and scene conversion. Generated preview images SHALL NOT be
committed as examples or golden images for this MVP slice.

#### Scenario: Fixture-backed parser and scene tests

- **WHEN** the automated tests run
- **THEN** they cover at least one CIF fixture, one POSCAR-style fixture, and
  one non-whitelisted ASE-readable format smoke test
- **AND** they validate the returned scene structure rather than comparing
  golden image files

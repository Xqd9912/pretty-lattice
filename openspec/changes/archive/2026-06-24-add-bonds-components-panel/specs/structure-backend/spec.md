## ADDED Requirements

### Requirement: Backend generates preview bonds with pymatgen

The Python backend SHALL generate preview bond records from the parsed pymatgen `Structure` using a project-defined allowlist of pymatgen neighbor algorithms. The default algorithm SHALL be CrystalNN. The initial allowlist SHALL include CrystalNN and other pymatgen algorithms that can run without user-provided custom cutoff tables. The returned scene contract SHALL remain project-owned JSON and SHALL NOT expose pymatgen objects or library type names as frontend data structures.

#### Scenario: Generate default CrystalNN bonds

- **WHEN** the API builds a scene response for a periodic structure and no bond algorithm is specified
- **THEN** the backend uses CrystalNN for preview bond analysis
- **AND** the response includes bond records when CrystalNN finds renderable bonds

#### Scenario: Generate bonds with a selected allowlisted algorithm

- **WHEN** the API receives a supported bond algorithm setting
- **THEN** the backend uses that algorithm for preview bond analysis
- **AND** the response includes bond records from that algorithm when it finds renderable bonds

#### Scenario: Reject unsupported bond algorithm identifiers

- **WHEN** the API receives an unsupported bond algorithm identifier
- **THEN** it returns a clear client error
- **AND** it does not fall back silently to a different algorithm

### Requirement: Backend returns one-hop bonded image data as a scene superset

The backend SHALL build a display-ready scene superset containing canonical atom instances, cell-boundary atom image instances, one-hop bonded atom image instances from canonical atom instances, and one-hop bonded atom image instances from cell-boundary atom image instances. One-hop bonded image generation SHALL NOT recursively expand from newly added one-hop bonded atom images. Atom image instances SHALL include metadata that distinguishes cell-boundary images from bonded images and SHALL include enough visibility-dependency metadata for the frontend to filter the superset locally. Bond visibility-dependency metadata SHALL be derived from the visibility groups of its endpoint atom instances so bonds between visible canonical and cell-boundary atom instances do not incorrectly depend on one-hop bonded atom visibility.

#### Scenario: Generate one-hop bonded images from canonical atoms

- **WHEN** a canonical atom has a bonded neighbor in an adjacent periodic image under the selected bond algorithm
- **THEN** the scene response includes a one-hop bonded atom image for that neighbor
- **AND** the response includes the short bond connecting the canonical atom to that image atom

#### Scenario: Generate one-hop bonded images from cell-boundary atoms

- **WHEN** cell-boundary atom images are generated and those image atoms have bonded neighbors in adjacent periodic images under the selected bond algorithm
- **THEN** the scene response includes the corresponding one-hop bonded atom images
- **AND** the response marks those one-hop bonded data as depending on cell-boundary atom visibility

#### Scenario: Stop after one hop

- **WHEN** the backend adds a one-hop bonded atom image to the scene superset
- **THEN** it does not use that newly added one-hop bonded atom image as a source for further bonded image generation

#### Scenario: Mark image reasons

- **WHEN** an atom instance is included only as a boundary image
- **THEN** its image-reason metadata includes `boundary`
- **AND** when an atom instance is included for one-hop bonded display, its image-reason metadata includes `bonded`

#### Scenario: Mark cell-boundary-only bonds independently from one-hop images

- **WHEN** a generated bond connects atom instances that are visible with canonical or cell-boundary atom visibility alone
- **THEN** the bond visibility-dependency metadata can be satisfied without enabling one-hop bonded atom visibility
- **AND** enabling or disabling one-hop bonded atom images is not required only because the bond crosses a cell boundary

### Requirement: Backend treats bond analysis warnings as non-fatal

The backend SHALL treat structure parsing as required for a successful preview and bond analysis as optional scene enrichment. If parsing succeeds but bond analysis fails, the API SHALL return the atom and cell scene data with an analysis warning instead of failing the entire preview request.

#### Scenario: Bond analysis fails after successful parsing

- **WHEN** the backend successfully parses the uploaded structure
- **AND** the selected bond algorithm raises an error during analysis
- **THEN** the API returns a successful structure preview response with atom and cell data
- **AND** the response includes a non-fatal analysis warning
- **AND** the response does not include invalid bond records

#### Scenario: Empty bond result is not a warning

- **WHEN** the selected bond algorithm completes successfully but finds no renderable bonds
- **THEN** the API returns a successful structure preview response
- **AND** it does not add an analysis warning only because the bond list is empty

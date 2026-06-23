## ADDED Requirements

### Requirement: Python API parses backend-supported CIF structures

The system SHALL parse uploaded periodic structure files through the Python
backend structure parser and convert successful parses into a structure preview
response. CIF files SHALL be the committed parser and scene fixture baseline.
Parse failures SHALL return a clear API error that the frontend can display.

#### Scenario: Parse a CIF fixture

- **WHEN** the API receives a valid committed CIF fixture
- **THEN** it returns a successful structure preview response
- **AND** the response includes unit-cell vectors and atom records

#### Scenario: Reject an invalid structure file

- **WHEN** the API cannot parse the uploaded file through the backend structure
  parser
- **THEN** it returns an error response with a clear parse message
- **AND** the frontend displays that message in the interaction card

### Requirement: Tests use local CIF fixtures and avoid generated preview artifacts

The system SHALL use local CIF fixtures as tests for file parsing and scene
conversion. Generated preview images SHALL NOT be committed as examples or
golden images for this migration.

#### Scenario: Fixture-backed parser and scene tests

- **WHEN** the automated tests run
- **THEN** they cover the committed CIF fixture matrix
- **AND** they validate the returned scene structure rather than comparing
  golden image files

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Python API parses ASE-readable structures

**Reason**: The backend structure model is migrating from ASE `Atoms` to
pymatgen `Structure`, and the preview path should no longer promise ASE-readable
formats as its compatibility boundary.

**Migration**: Use the new backend-supported CIF structure parsing requirement.
Additional formats can be added later through the backend structure capability
without reintroducing ASE as the canonical backend model.

### Requirement: Tests use copied fixtures and avoid generated preview artifacts

**Reason**: The old test requirement was tied to archived hand-written fixtures,
POSCAR coverage, and an ASE non-whitelisted format smoke test.

**Migration**: Use the new local CIF fixture matrix requirement for parser and
scene regression tests.

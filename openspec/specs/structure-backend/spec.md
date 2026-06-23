## Purpose

Define the Python backend boundary for structure parsing, canonical in-memory
structure objects, dependency ownership, scene conversion inputs, symmetry
summary generation, and local fixture policy.

## Requirements

### Requirement: Backend uses pymatgen structures

The Python backend SHALL use pymatgen `Structure` as the canonical in-memory
model for periodic structure files accepted by the structure preview path.
Backend parsing and scene conversion SHALL NOT expose pymatgen objects to the
frontend API.

#### Scenario: Parse a CIF into the backend model

- **WHEN** the backend receives a valid CIF fixture
- **THEN** it parses the file into a pymatgen `Structure`
- **AND** the parsed structure contains canonical sites, lattice vectors,
  element symbols, Cartesian coordinates, and fractional coordinates

#### Scenario: Keep the frontend contract library-independent

- **WHEN** the backend converts a parsed structure for the browser
- **THEN** it returns the project scene JSON contract
- **AND** the response does not contain pymatgen-specific Python objects or
  library type names

### Requirement: Backend dependency boundary is pymatgen-level

The Python runtime dependency set SHALL use pymatgen for structure IO and
materials-analysis helpers. ASE SHALL NOT remain a runtime dependency for the
structure preview backend. `spglib` SHALL NOT remain a direct project runtime
dependency when pymatgen provides the needed symmetry wrapper.

#### Scenario: Runtime dependencies are clean

- **WHEN** project dependencies are inspected after the migration
- **THEN** pymatgen is present as a runtime dependency
- **AND** ASE is absent from the runtime dependency list
- **AND** `spglib` is absent from the direct runtime dependency list

#### Scenario: Backend code avoids direct low-level symmetry imports

- **WHEN** backend structure modules are inspected after the migration
- **THEN** they do not import `spglib` directly
- **AND** symmetry behavior is accessed through pymatgen-level APIs

### Requirement: Backend produces symmetry summaries through pymatgen

The backend SHALL produce the existing structure symmetry summary from
pymatgen-level symmetry analysis when the parsed structure is periodic and
symmetry analysis succeeds. The summary SHALL keep nullable fields for values
that are unavailable through pymatgen metadata and project-owned mappings.

#### Scenario: Summarize symmetry for a periodic CIF fixture

- **WHEN** the backend builds a scene response for a periodic CIF fixture with
  detectable symmetry
- **THEN** the response summary marks symmetry as available
- **AND** the summary includes the space-group symbol, space-group number,
  point-group symbol, crystal system, and lattice system
- **AND** the summary includes a Schoenflies point-group symbol when the
  pymatgen point-group symbol is covered by the project-owned crystallographic
  mapping

#### Scenario: Keep optional symmetry fields nullable

- **WHEN** a supplementary symmetry notation cannot be produced through the
  pymatgen-level backend API
- **THEN** the corresponding summary field is returned as `null`
- **AND** the backend does not add a direct `spglib` dependency only to fill
  that field

### Requirement: Backend tests use local CIF fixtures

The backend test suite SHALL use local CIF fixtures as the committed parser,
scene, and symmetry regression baseline. Automated tests SHALL NOT require
network access to Materials Project or any other remote structure source.

#### Scenario: Parse the CIF fixture matrix

- **WHEN** backend tests run
- **THEN** they parse every committed CIF fixture under the structure fixture
  directory
- **AND** they validate canonical site count, element set, scene summary, and
  symmetry summary for representative fixtures

#### Scenario: Avoid online fixture fetches

- **WHEN** backend tests run in an offline environment
- **THEN** fixture-backed parser and scene tests can complete using only files
  committed to the repository

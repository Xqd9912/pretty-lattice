## ADDED Requirements

### Requirement: Backend generates Crystal Toolkit-compatible preview polyhedra

The Python backend SHALL generate preview polyhedron records from the same selected pymatgen neighbor connectivity used for preview bonds. Polyhedra generation SHALL follow Crystal Toolkit-compatible center-selection semantics: a candidate center SHALL produce a polyhedron only when it has more than three drawn connected atom instances, has no missing connected atom instances required by the selected connectivity, and is lower than every drawn connected neighbor in pymatgen's species ordering. Equal-species connected environments SHALL NOT produce polyhedra. The returned polyhedron records SHALL remain project-owned JSON and SHALL NOT expose Crystal Toolkit scene primitives or pymatgen objects.

#### Scenario: Generate default CrystalNN polyhedra

- **WHEN** the API builds a scene response for a periodic structure and no bond algorithm is specified
- **THEN** the backend uses CrystalNN connectivity for preview bond and polyhedra analysis
- **AND** the response includes polyhedron records for complete Crystal Toolkit-compatible coordination environments

#### Scenario: Generate polyhedra with selected connectivity

- **WHEN** the API receives a supported bond algorithm setting
- **THEN** the backend uses that selected algorithm's connectivity for both bonds and polyhedra
- **AND** the response does not mix polyhedra generated from a different neighbor algorithm

#### Scenario: Suppress reverse and same-species centers

- **WHEN** a candidate center has a connected neighbor that is lower than or equal to the center in pymatgen's species ordering
- **THEN** the backend does not create a polyhedron for that candidate center
- **AND** other eligible centers in the same scene can still produce polyhedra

#### Scenario: Skip incomplete coordination environments

- **WHEN** a candidate center has connected sites required by the selected connectivity that are not present as drawn atom instances in the scene superset
- **THEN** the backend does not create a partial polyhedron for that candidate center
- **AND** it does not return a broken polyhedron with missing vertices

### Requirement: Backend returns renderable polyhedron geometry

The backend SHALL return each polyhedron as renderable geometry data containing a stable ID, center atom ID, ordered hull atom IDs, triangular face indices, color, and visibility-dependency metadata. The ordered hull atom IDs SHALL include the center atom instance followed by the drawn connected atom instances used as the hull input, matching Crystal Toolkit's center-plus-neighbor position set. Face indices SHALL refer to positions in the ordered hull atom ID list.

#### Scenario: Return hull atom IDs and faces

- **WHEN** a candidate coordination environment produces a valid convex hull
- **THEN** the scene response includes a polyhedron record with the center atom ID
- **AND** the record includes ordered hull atom IDs with the center atom first
- **AND** the record includes triangular face indices into that ordered hull atom ID list

#### Scenario: Use center color

- **WHEN** the backend creates a polyhedron record
- **THEN** the record color is derived from the center atom color
- **AND** the record does not include frontend material opacity

#### Scenario: Mark polyhedron visibility dependencies

- **WHEN** a generated polyhedron uses boundary or one-hop bonded atom image instances
- **THEN** the polyhedron visibility-dependency metadata can be satisfied only when those required image categories are enabled
- **AND** polyhedra that use only canonical atom instances do not depend on image visibility settings

### Requirement: Backend treats polyhedra analysis warnings as non-fatal

The backend SHALL treat polyhedra generation as optional scene enrichment. If structure parsing succeeds but polyhedra generation fails for the scene, the API SHALL return the available atom, cell, and bond scene data with a non-fatal analysis warning instead of failing the entire preview request. Degenerate or ineligible individual centers SHALL be skipped without warning when the rest of polyhedra analysis completes normally.

#### Scenario: Polyhedra analysis fails after successful parsing

- **WHEN** the backend successfully parses the uploaded structure
- **AND** polyhedra generation raises an unexpected scene-level error
- **THEN** the API returns a successful structure preview response with available atom, cell, and bond data
- **AND** the response includes a non-fatal analysis warning
- **AND** the response does not include invalid polyhedron records

#### Scenario: Empty polyhedra result is not a warning

- **WHEN** polyhedra generation completes successfully but finds no eligible complete coordination environments
- **THEN** the API returns a successful structure preview response
- **AND** it does not add an analysis warning only because the polyhedra list is empty

# Use Pymatgen as the Python Structure Backend

## Status

Accepted.

## Context

Pretty Lattice is a local web GUI for publication-ready crystal-structure
figures. The Python backend owns structure IO, materials analysis, and scene
generation; the Web frontend owns visual interaction and rendering.

The first structure-preview implementation used ASE because it was a small,
fast way to read common structure files and build the initial scene contract.
That was useful for the MVP, but the project direction now depends more on
materials-analysis semantics than on calculator or molecular-dynamics
workflows.

The current backend needs a cleaner foundation for:

- periodic crystal structures and lattice-aware coordinates;
- symmetry summaries;
- future bond graphs and coordination polyhedra;
- keeping crystallographic decisions in Python instead of in the browser.

Pymatgen's core model is `Structure` / `Lattice`, and its analysis modules
cover symmetry, neighbor finding, structure graphs, and coordination
environments. That matches Pretty Lattice's backend responsibilities more
directly than ASE.

## Decision

Use pymatgen as the canonical Python backend for periodic structures.

The backend should read uploaded structure files into pymatgen `Structure`
objects, build scene responses from those structures, and use pymatgen's
analysis APIs for symmetry and later materials-analysis features.

ASE should be removed from the main runtime dependency set when the migration
lands. Direct `spglib` usage should also be removed from project code, and
`spglib` should not remain a direct project dependency if pymatgen already
provides the needed symmetry wrapper.

The frontend scene contract remains project-owned JSON. The browser should not
receive pymatgen objects or need to know which Python library produced the
scene.

## Consequences

- The backend model becomes more aligned with crystal visualization,
  symmetry, bond graphs, and future polyhedra work.
- The dependency surface gets cleaner: Pretty Lattice depends on pymatgen
  directly, and pymatgen owns its lower-level symmetry dependency.
- Tests should use local CIF fixtures as the primary parser and scene
  regression set.
- Non-periodic molecule support is no longer implied by the structure-preview
  path. It can be added later as an explicit feature if needed.
- Some current scene-building code will need translation from ASE APIs to
  pymatgen APIs, especially cell vectors, Cartesian/fractional positions,
  formula formatting, periodicity checks, and symmetry summaries.

## Migration Boundary

This decision is about the backend foundation. The migration should preserve
the existing scene response shape and visible frontend behavior.

Bond detection, one-hop bond completion, StructureGraph rendering, and Chemenv
polyhedra are unlocked by this decision, but they should land as separate
capabilities after the backend object model is clean.

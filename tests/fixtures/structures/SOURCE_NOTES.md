# Structure Fixture Source Notes

These fixtures are local CIF files manually downloaded from Materials Project
for backend parsing, scene construction, and symmetry-summary regression tests.
They replace the earlier hand-written and POSCAR fixtures so the structure test
set is CIF-only.

The files are named by simple formula labels. The CIF contents currently do not
embed Materials Project material IDs, so keep those IDs in commit messages or a
future manifest if exact upstream records need to be tracked.

## Fixtures

| File | Parsed formula | Canonical sites | Elements | Notes |
| --- | --- | ---: | --- | --- |
| `Al2O3.cif` | Al2O3 | 30 | Al, O | Corundum-like trigonal/rhombohedral case; useful for non-cubic lattice summaries. |
| `Ba2Ca2Cu3HgO8.cif` | Ba2Ca2Cu3HgO8 | 16 | Ba, Ca, Cu, Hg, O | Multi-element oxide superconductor-style layered cell; useful for richer legends and boundary images. |
| `Hg3Cl4O.cif` | Hg3Cl4O | 32 | Hg, Cl, O | Larger cubic/chiral case with heavier elements. |
| `MoS2.cif` | MoS2 | 6 | Mo, S | Layered hexagonal material; useful for future slab and bond-display checks. |
| `NaCl.cif` | NaCl | 8 | Na, Cl | Rock-salt baseline with many boundary atoms in the conventional cell. |
| `Si.cif` | Si | 8 | Si | Single-element diamond-cubic baseline. |
| `Sm(Mo3S4)2.cif` | Sm(Mo3S4)2 | 45 | Sm, Mo, S | Larger trigonal/rhombohedral ternary fixture; filename keeps the source formula label. |
| `SrTiO3.cif` | SrTiO3 | 5 | Sr, Ti, O | Perovskite baseline; useful for future octahedra tests. |
| `TiO2.cif` | TiO2 | 6 | Ti, O | Rutile-style tetragonal baseline; useful for future coordination checks. |

## Test Policy

- Use these CIFs as stable local fixtures; automated tests should not fetch
  remote structure data.
- Do not add duplicate POSCAR files just to compare parser behavior across
  formats. Cross-format equivalence belongs to the upstream parser, not to
  Pretty Lattice's fixture suite.
- Treat the CIF file headers as source data, not as the expected symmetry
  oracle. Current tests validate the symmetry summary produced by the backend
  analysis path.
- Generated preview images should stay out of this directory until visual
  golden tests are intentionally introduced.

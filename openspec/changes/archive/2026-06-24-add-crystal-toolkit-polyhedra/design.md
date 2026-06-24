## Context

The current preview path parses a structure with pymatgen, builds a project-owned scene JSON, and renders atoms, bonds, and the unit cell in React Three Fiber. Bond generation already uses a selected pymatgen neighbor strategy and returns a complete one-hop bonded image superset so the browser does not need to understand periodic neighbor finding.

Crystal Toolkit has a small, useful polyhedra rule set layered on top of a pymatgen `StructureGraph`: collect connected sites for each drawn site, skip incomplete environments, skip centers that would create intersecting polyhedra by using pymatgen's electronegativity ordering, then build a convex hull from the center plus connected-site positions. This change brings those semantics into Pretty Lattice without adopting Crystal Toolkit's renderer or scene format.

## Goals / Non-Goals

**Goals:**

- Generate coordination polyhedra from the same connectivity used for preview bonds.
- Match Crystal Toolkit's center-selection and completeness rules.
- Keep the browser contract project-owned and render-ready.
- Let local display controls show or hide polyhedra without re-uploading the file.
- Keep atoms, bonds, unit cell, and polyhedra independent display components.

**Non-Goals:**

- Adding manual center-element selection, per-element cutoff tables, or ChemEnv labels.
- Replacing Pretty Lattice's scene contract with Crystal Toolkit's `Scene` primitives.
- Adding a polyhedra style panel in this slice.

## Decisions

### Reuse Connectivity Once

The backend should derive a single internal connectivity result from the selected bond algorithm and use it for both bond records and polyhedra records. This keeps bonds and polyhedra consistent when the user switches between `CrystalNN`, `MinimumDistanceNN`, and `VoronoiNN`.

The connectivity result should preserve source atom instance, connected atom instance, site index, image offset, and visibility-dependency groups. Polyhedra generation should use the drawn connected sites from this result rather than asking pymatgen for a second, separate neighbor list.

### Match Crystal Toolkit Polyhedra Semantics

For each drawn atom instance considered as a possible center, the backend should apply the same conditions Crystal Toolkit applies in `Site.get_scene`:

- `draw_polyhedra` is enabled by the scene builder.
- the center has more than three drawn connected sites;
- the center has no connected sites that are required by the selected connectivity but missing from the scene superset;
- every connected neighbor is greater than the center in pymatgen's species ordering.

pymatgen species ordering defaults to Pauling electronegativity, so this makes lower-electronegativity centers such as Ti, Si, and Al produce O-coordination polyhedra while the reverse O-centered shells are suppressed. Equal-species connected environments are also suppressed, matching Crystal Toolkit's `x.site.specie == self.specie` check.

### Build Faces From Crystal Toolkit's Position Set

Crystal Toolkit includes the center position in the hull input along with connected-site positions. Pretty Lattice should do the same. The returned polyhedron record should therefore expose hull input atom IDs rather than pretending the connected atoms are always the only geometric vertices.

Recommended first contract:

```ts
interface PolyhedronSpec {
  id: string;
  centerAtomId: string;
  hullAtomIds: string[];
  faces: [number, number, number][];
  color: string;
  visibilityDependencies: VisibilityDependency[];
  visibilityDependencyGroups: VisibilityDependency[][];
}
```

`hullAtomIds` should put the center atom first, followed by the drawn connected atom instances used for the hull. `faces` indexes into `hullAtomIds`. This lets the frontend construct a `BufferGeometry` without rerunning any hull logic.

Because Crystal Toolkit's explicit path uses SciPy Delaunay hull output, the backend should use SciPy geometry for the first version. Hull failures, coplanar points, or degenerate environments should skip that center rather than returning a broken polyhedron.

### Keep Visibility Local And Conservative

Polyhedron visibility should follow the same dependency model as atoms and bonds. If all required atom instances for a polyhedron are visible, the polyhedron can render. If the user hides cell-boundary atom images or one-hop bonded atom images and a polyhedron needs one of those atom instances, that entire polyhedron is hidden rather than drawn as a partial shell.

Turning off `Atoms` should hide atom spheres only; it should not force polyhedra off. Turning off `Polyhedra` should hide polyhedra only; it should not affect atoms, bonds, or the unit-cell frame.

### Render Simply

The frontend should render polyhedra as translucent surfaces with edge outlines. Color should come from the center atom color, matching Crystal Toolkit and VESTA-like practice. Surface opacity and edge styling are frontend renderer defaults; style controls are deferred.

Transparent polyhedra should be rendered before atom spheres and bonds so atoms and bonds remain legible. The implementation may need conservative Three.js material settings such as disabled depth writing for the translucent surface.

## Risks / Trade-offs

- Crystal Toolkit's electronegativity rule is simple and can suppress useful same-element coordination environments -> Keep the first slice compatible, then add explicit center selection later if users need it.
- Including the center point in the hull input can produce different geometry from a pure neighbor-shell hull when the center is outside the neighbor hull -> This is intentional for compatibility; tests should lock representative output.
- Some structures can produce coplanar or degenerate hull inputs -> Skip only that polyhedron and continue returning the scene.
- More scene geometry can make large structures heavier -> Generate from the existing one-hop scene superset and avoid recursive expansion.
- Transparent rendering can look order-dependent -> Keep material choices simple and verify with fixture scenes before adding style controls.

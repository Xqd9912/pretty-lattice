# Naumann-Style Standard View Algorithm

This note describes the default "standard view" used by Pretty Lattice for the
main crystal preview. The goal is to keep the view reproducible and easy to
explain, while avoiding a cubic-only interpretation of the traditional
clinographic drawing convention.

## Summary

Pretty Lattice uses a Naumann-style clinographic view as its default crystal
orientation:

- the direct `c` axis is treated as the vertical crystal reference;
- the screen-up direction is the projection of `c` into the screen plane;
- the horizontal viewing azimuth follows the traditional ratio `1 : 1/3`;
- the upward viewing tilt follows the traditional ratio `1 : 1/6`;
- for a cubic cell, this is equivalent to viewing along the direct direction
  `[6 2 1]`;
- for non-cubic cells, especially hexagonal and trigonal cells, `[6 2 1]` is
  not applied as a direct-lattice coefficient vector.

The last point is the important one. The `[6 2 1]` direction is a convenient
cubic result of a more general drawing construction. It is not the general
definition of the construction.

## Historical Reference

The immediate historical reference is Samuel Lewis Penfield, "On Crystal
Drawing," *American Journal of Science* s4-19(109), 39-75, 1905,
<https://doi.org/10.2475/ajs.s4-19.109.39>.

Penfield describes the common crystallographic drawing method as a parallel
projection: the point of vision is effectively at infinity, so parallel crystal
edges remain parallel in the drawing. He distinguishes orthographic projection
from clinographic projection, and notes that most mineralogical and
crystallographic figures of the period used clinographic projection.

For the isometric system, Penfield derives the familiar orientation from two
simple choices:

1. rotate the crystal by `18deg 26'` around the vertical axis, so that
   `tan(18deg 26') = 1/3`;
2. raise the eye so that the vertical displacement used in the clinographic
   construction is `1/6` of the corresponding horizontal front-back distance.

He also says these choices are ultimately conventional, but that they were
already established by long usage and correspond to the Naumann textbook
scheme.

For the hexagonal system, Penfield does not introduce a separate arbitrary
viewing index. Instead, he says the same principles used for the isometric axes
can be used for the hexagonal axes. The construction changes because the axes
are different, not because the default view becomes a universal direct
`[6 2 1]` direction.

For tetragonal and orthorhombic crystals, Penfield modifies the isometric axes
by changing axis lengths. For monoclinic and triclinic crystals, he starts from
the isometric construction and then inclines and scales the axes using the cell
angles. In later examples, he also shows that special cases may deserve a
different rotation angle when the standard clinographic view hides important
faces. We do not implement those special-case artistic choices as automatic
rules.

## Why Not Use Direct `[6 2 1]` for Every Cell?

In a cubic cell,

$$
\mathbf a \perp \mathbf b \perp \mathbf c,\qquad
|\mathbf a|=|\mathbf b|=|\mathbf c|.
$$

If the Naumann construction gives the local orthonormal viewing direction

$$
\mathbf d \propto \mathbf x + {1 \over 3}\mathbf y + {1 \over 6}\mathbf z,
$$

and if

$$
\mathbf x=\hat{\mathbf a},\qquad
\mathbf y=\hat{\mathbf b},\qquad
\mathbf z=\hat{\mathbf c},
$$

then multiplying by 6 gives

$$
\mathbf d \propto 6\mathbf a + 2\mathbf b + \mathbf c.
$$

That is the familiar cubic `[6 2 1]` direction.

For a hexagonal or trigonal cell, however, the direct `a` and `b` axes are not a
Cartesian `x,y` pair. They are usually separated by 120 degrees. Applying

$$
6\mathbf a + 2\mathbf b + \mathbf c
$$

directly would mix the non-orthogonal lattice basis into the camera convention.
The result is not the same as "rotate by `18deg 26'` in the basal plane and
then tilt upward." It is a different view that happens to share the same three
numbers.

Pretty Lattice therefore treats `[6 2 1]` as a cubic consequence, not as the
general algorithm.

## Standard View Construction

Let the direct cell vectors be

$$
\mathbf a,\quad \mathbf b,\quad \mathbf c.
$$

The standard view first builds a local orthonormal frame attached to the cell.

### 1. Vertical Reference

The vertical crystal reference is the normalized direct `c` axis:

$$
\mathbf z = {\mathbf c \over ||\mathbf c||}.
$$

If `c` is degenerate, the implementation falls back to the Cartesian `+Z`
direction.

### 2. Basal Reference

The horizontal reference is the projection of `a` into the plane perpendicular
to `z`:

$$
\tilde{\mathbf x}
  = \mathbf a - (\mathbf a\cdot\mathbf z)\mathbf z.
$$

If this projected vector has usable length,

$$
\mathbf x = {\tilde{\mathbf x} \over ||\tilde{\mathbf x}||}.
$$

If `a` is parallel to `c` or otherwise degenerate, the same projection is tried
with `b`. If both fail, the code uses a deterministic perpendicular fallback.

### 3. Basal Right Direction

The second basal direction is constructed orthogonally:

$$
\mathbf y = \mathbf z \times \mathbf x.
$$

This is the key step that makes hexagonal and trigonal cells behave like the
historical construction. The viewing azimuth is measured in an orthonormal
basal drawing frame, not in the raw direct `a,b` coordinate system.

### 4. Viewing Direction

The unnormalized outward viewing direction is

$$
\mathbf d_0 =
  \mathbf x
  + {1 \over 3}\mathbf y
  + {1 \over 6}\mathbf z.
$$

The camera outward direction is

$$
\mathbf d = {\mathbf d_0 \over ||\mathbf d_0||}.
$$

Equivalently, after multiplying by 6,

$$
\mathbf d \propto 6\mathbf x + 2\mathbf y + \mathbf z.
$$

This is why the cubic case still looks like `[6 2 1]`.

### 5. Screen-Up Direction

The screen-up vector is the projection of the vertical crystal reference into
the screen plane:

$$
\tilde{\mathbf u}
  = \mathbf z - (\mathbf z\cdot\mathbf d)\mathbf d.
$$

If this vector is nonzero,

$$
\mathbf u = {\tilde{\mathbf u} \over ||\tilde{\mathbf u}||}.
$$

Thus the direct `c` axis appears upward on screen as much as the view permits.
It is not forced to be exactly vertical in 3D space; it is projected into the
2D screen plane and used as screen-up.

The screen-right vector is then

$$
\mathbf r = \mathbf u \times \mathbf d.
$$

The screen frame is right-handed:

$$
\mathbf r \times \mathbf u = \mathbf d.
$$

## Default Camera State

The interactive crystal camera stores the primary direction as direct-lattice
coefficients and the secondary direction as reciprocal-lattice coefficients.
The standard view is first computed in Cartesian space as described above.
Then it is converted into the existing camera-state representation:

$$
\mathbf d =
  u\mathbf a + v\mathbf b + w\mathbf c,
$$

for the primary outward direction, and

$$
\mathbf z =
  h\mathbf a^* + k\mathbf b^* + l\mathbf c^*,
$$

for the upward anchor. The camera math then projects the secondary vector
perpendicular to the primary vector, which reproduces the same screen-up
direction as the standard-view formula.

The displayed coefficients are normalized by their largest absolute component.
For a cubic cell, the direct coefficients are therefore shown as approximately

$$
[u,v,w] = [1,\; 0.3333,\; 0.1667],
$$

which is the normalized form of `[6 2 1]`.

For a hexagonal cell, the stored direct coefficients are generally different
because the same Cartesian standard view must be expressed in a non-orthogonal
direct basis. That difference is expected.

## Default Fit and Zoom

The standard orientation is also used to compute the initial 100 percent fit.
The fit bounds intentionally use only the unit-cell corners, not atom radii or
bond radii. This keeps the camera scale stable when the user changes atom
radius models.

Let the eight unit-cell corners, after centering the cell, be projected onto
the standard-view screen axes:

$$
x_i = \mathbf p_i\cdot\mathbf r,\qquad
y_i = \mathbf p_i\cdot\mathbf u.
$$

The projected cell footprint is

$$
W = \max_i x_i - \min_i x_i,
$$

$$
H = \max_i y_i - \min_i y_i.
$$

For a viewport with safe-area-adjusted dimensions

$$
A_w = \text{viewport width} - \text{left inset} - \text{right inset},
$$

$$
A_h = \text{viewport height} - \text{top inset} - \text{bottom inset},
$$

the fit uses the geometric mean of the available and projected sizes:

$$
L_A = \sqrt{A_w A_h},
$$

$$
L_P = \sqrt{W H}.
$$

With padding factor `P = 2`, the initial orthographic zoom is

$$
Z_\text{fit} = {L_A \over P L_P}.
$$

This is deliberately softer than fitting the larger projected side exactly.
Very elongated cells may extend beyond the viewport at 100 percent, but the
default composition is visually less dominated by extreme aspect ratios. Users
can still zoom freely.

## Implementation Pointers

The standard-view vector construction lives in:

- `web/src/scene/viewMath.ts`
  - `computeStandardViewVectors`
  - `computeStandardCameraPose`
  - `computeCameraFitZoom`

The conversion into editable crystal-camera state lives in:

- `web/src/scene/crystalCamera.ts`
  - `createDefaultCrystalCameraState`
  - `computeCrystalCameraVectors`

The main regression tests are:

- `web/tests/latticeScene.test.ts`
  - cubic standard view
  - rectangular orthogonal standard view
  - hexagonal basal-frame standard view
  - unit-cell-only fit bounds
- `web/tests/crystalCamera.test.ts`
  - default camera state equivalence
  - hexagonal orthonormal basal-frame behavior

## Practical Interpretation

The user-facing rule can be stated simply:

Pretty Lattice looks at the crystal from the traditional clinographic direction
and keeps the direct `c` axis visually upward. In cubic cells this is the same
as a `[6 2 1]` view. In other crystal systems, the same viewing angles are
applied in a local drawing frame, so the view remains comparable across
different cell shapes instead of being distorted by non-orthogonal lattice
coordinates.

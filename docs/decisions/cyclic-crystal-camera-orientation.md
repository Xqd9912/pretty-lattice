# Use Cyclic Crystal Orientation for Camera Roll Zero

## Status

Accepted 2026-06-30.

## Context

Crystal camera controls need two choices:

- which crystal direction is aligned to a screen axis;
- which roll angle is treated as zero around that aligned direction.

The first choice is explicit. The second choice is otherwise underdetermined:
after one direction is fixed, the camera can still rotate freely around that
direction.

VESTA-style direct-axis views appear to use a simple cyclic convention. When a
direct crystal axis points out of the screen, the next direct axis projects to
screen right:

```text
a -> outward  means  b projects right
b -> outward  means  c projects right
c -> outward  means  a projects right
```

Pretty Lattice should use this as the default roll convention, and extend it to
arbitrary direct-lattice view directions.

## Decision

Use one cyclic rule for both discrete axis presets and continuous direct-lattice
directions.

Let the direct basis be

$$
\mathbf a,\quad \mathbf b,\quad \mathbf c
$$

and let the screen basis be

$$
X=\text{right},\qquad Y=\text{up},\qquad Z=\text{outward},
\qquad X\times Y=Z.
$$

Both bases are treated cyclically:

```text
a -> b -> c -> a
X -> Y -> Z -> X
```

For a requested direct-lattice direction

$$
\mathbf d = u\mathbf a + v\mathbf b + w\mathbf c,
$$

define the cyclic crystal transport

$$
T(\mathbf a)=\mathbf b,\qquad
T(\mathbf b)=\mathbf c,\qquad
T(\mathbf c)=\mathbf a.
$$

Therefore

$$
T(\mathbf d)=u\mathbf b+v\mathbf c+w\mathbf a
            =w\mathbf a+u\mathbf b+v\mathbf c.
$$

If the user aligns $\mathbf d$ to screen axis $S$, first normalize

$$
\mathbf p = \frac{\mathbf d}{\lVert \mathbf d\rVert}.
$$

Then use $T(\mathbf d)$ to define the next screen axis. With
$S^+=\operatorname{next}(S)$, project the cyclic anchor into the screen plane:

$$
\Pi_{\mathbf p}(\mathbf q_0)
  = \mathbf q_0 - (\mathbf q_0\cdot \mathbf p)\mathbf p,
\qquad
\mathbf q_0 = T(\mathbf d).
$$

If this projection is nonzero, normalize it:

$$
\mathbf q =
\frac{\Pi_{\mathbf p}(\mathbf q_0)}
     {\lVert \Pi_{\mathbf p}(\mathbf q_0)\rVert}.
$$

The camera frame is then defined by

```text
screen[S]       = p
screen[next(S)] = q
screen[next2(S)] is completed by the right-hand rule
```

For example, if $S=Z$, then `next(S) = X`, so the cyclic anchor becomes the
screen-right direction. This gives:

```text
a -> Z  means  b projects to X
b -> Z  means  c projects to X
c -> Z  means  a projects to X
```

The same rule works for any target screen axis:

```text
a -> X  means  b projects to Y
a -> Y  means  b projects to Z
a -> Z  means  b projects to X
```

## Fallback

If the cyclic anchor is degenerate after projection, use the direct `c` axis as
the fallback roll reference:

$$
\mathbf q_0 = \mathbf c.
$$

If that is also degenerate, use the direct `a` axis:

$$
\mathbf q_0 = \mathbf a.
$$

Each fallback uses the same projection formula. This keeps the rule simple:
prefer cyclic transport, otherwise keep the special vertical role of `c`, and
only then fall back to `a`.

Zero-length requested directions are invalid input and should be rejected or
replaced by the current/default camera direction before this algorithm runs.

## Consequences

- Direct-axis presets and arbitrary `[u v w]` directions share one camera-roll
  definition.
- The discrete `a`, `b`, and `c` views match the observed VESTA-like cyclic
  direct-axis behavior.
- The algorithm is independent of cell angles because all projections are done
  in Cartesian space after forming the real direct-lattice vectors.
- The fallback is intentionally small and explainable. It treats `c` as the
  preferred structural reference when the cyclic transport cannot determine a
  roll angle.

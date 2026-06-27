# Camera Orientation Math

Pretty Lattice follows the VESTA-style split between one direct-lattice direction
and one reciprocal-lattice direction. Let

$$
\mathbf a_1=\mathbf a,\qquad
\mathbf a_2=\mathbf b,\qquad
\mathbf a_3=\mathbf c
$$

and let

$$
\mathbf a^1=\mathbf a^*,\qquad
\mathbf a^2=\mathbf b^*,\qquad
\mathbf a^3=\mathbf c^*
$$

be the reciprocal basis, omitting the conventional factor of $2\pi$, so that

$$
\mathbf a_i\cdot \mathbf a^j=\delta_i^{\,j}.
$$

The selected primary direction is represented by direct-lattice coefficients:

$$
\mathbf p_0=u\mathbf a+v\mathbf b+w\mathbf c.
$$

The other view direction is represented by reciprocal-lattice coefficients:

$$
\mathbf s_0=h\mathbf a^*+k\mathbf b^*+l\mathbf c^*.
$$

This is the useful part of the convention: their perpendicularity condition is
just the coefficient pairing

$$
\mathbf p_0\cdot \mathbf s_0=uh+vk+wl.
$$

Therefore an exactly compatible pair satisfies

$$
uh+vk+wl=0,
$$

independent of the cell angles.

For manual input, the primary direction is kept fixed. We first normalize it,

$$
\mathbf p=\frac{\mathbf p_0}{\lVert\mathbf p_0\rVert},
$$

then remove the primary-direction component from the secondary direction:

$$
\tilde{\mathbf s}=\mathbf s_0-(\mathbf s_0\cdot \mathbf p)\mathbf p.
$$

If this projected vector is nonzero, the secondary direction used by the camera
is

$$
\mathbf s=\frac{\tilde{\mathbf s}}{\lVert\tilde{\mathbf s}\rVert}.
$$

Thus a non-orthogonal manual pair is interpreted as: keep the primary
direction, and orthogonalize the other direction against it.

If $\lVert\tilde{\mathbf s}\rVert$ is too small, the submitted secondary
direction does not determine a roll angle around $\mathbf p$. In that case the
camera uses a deterministic VESTA-like anchor. It tries the reciprocal axes in
the order

$$
\mathbf r_1=\mathbf c^*,\qquad
\mathbf r_2=\mathbf b^*,\qquad
\mathbf r_3=\mathbf a^*
$$

and chooses the first projected candidate

$$
\mathbf q_i=\mathbf r_i-(\mathbf r_i\cdot \mathbf p)\mathbf p
$$

with nonzero length:

$$
\mathbf s=\frac{\mathbf q_i}{\lVert\mathbf q_i\rVert}.
$$

Only if all reciprocal candidates are degenerate does the camera fall back to a
fixed Cartesian axis, projected by the same formula. This final step is a
last-resort convention, not a replacement for the crystal-coordinate rule.

For the two primary-direction modes, the resulting camera directions are assigned as

$$
\text{Outward primary:}\qquad
\mathbf{out}=\mathbf p,\qquad \mathbf{up}=\mathbf s,
$$

and

$$
\text{Upward primary:}\qquad
\mathbf{up}=\mathbf p,\qquad \mathbf{out}=\mathbf s.
$$

The same anchor also defines zero roll: changing the roll rotates
$\mathbf s$ about the fixed axis $\mathbf p$.

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide } from "three";

export interface IsosurfaceOverlay {
  vertices: Float32Array;
  faces: Uint32Array;
  color: string;
  opacity: number;
}

/**
 * Renders a charge-density iso-surface mesh. Vertices are already in the
 * structure's Cartesian frame, so this is placed in the same centering group as
 * the atoms by the caller. Normals are computed here from the geometry, which is
 * correct for any (even non-orthogonal) cell.
 */
export function DensityIsosurface({ vertices, faces, color, opacity }: IsosurfaceOverlay) {
  const geometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    geometry.setIndex(new BufferAttribute(faces, 1));
    geometry.computeVertexNormals();
    return geometry;
  }, [vertices, faces]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} renderOrder={1000}>
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        side={DoubleSide}
        depthWrite={opacity >= 1}
        roughness={0.55}
        metalness={0}
      />
    </mesh>
  );
}

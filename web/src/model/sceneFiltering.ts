import type { AtomSpec, BondSpec, PolyhedronSpec, SceneSpec } from "../api/scene";

export interface SceneRelationFilter {
  bonds?: boolean;
  polyhedra?: boolean;
}

/**
 * Return a scene containing only atoms accepted by `predicate` and relations
 * whose atom references all survive. Atom indices in bonds and polyhedra are
 * remapped to the filtered atom array; the input scene is never mutated.
 */
export function filterSceneAtoms(
  scene: SceneSpec | null,
  predicate: (atom: AtomSpec, atomIndex: number) => boolean,
  relations: SceneRelationFilter = {},
): SceneSpec | null {
  if (!scene) {
    return scene;
  }

  const atomIndexMap = new Map<number, number>();
  const atoms: AtomSpec[] = [];
  scene.atoms.forEach((atom, atomIndex) => {
    if (predicate(atom, atomIndex)) {
      atomIndexMap.set(atomIndex, atoms.length);
      atoms.push(atom);
    }
  });

  const includeBonds = relations.bonds ?? true;
  const includePolyhedra = relations.polyhedra ?? true;
  const atomsUnchanged = atoms.length === scene.atoms.length;
  const bondsUnchanged = includeBonds || scene.bonds.length === 0;
  const polyhedraUnchanged = includePolyhedra || scene.polyhedra.length === 0;
  if (atomsUnchanged && bondsUnchanged && polyhedraUnchanged) {
    return scene;
  }

  return {
    ...scene,
    atoms,
    bonds: includeBonds
      ? scene.bonds.flatMap((bond) => remapBond(bond, atomIndexMap))
      : [],
    polyhedra: includePolyhedra
      ? scene.polyhedra.flatMap((polyhedron) =>
          remapPolyhedron(polyhedron, atomIndexMap),
        )
      : [],
  };
}

function remapBond(bond: BondSpec, atomIndexMap: ReadonlyMap<number, number>): BondSpec[] {
  const startAtomIndex = atomIndexMap.get(bond.startAtomIndex);
  const endAtomIndex = atomIndexMap.get(bond.endAtomIndex);
  if (startAtomIndex === undefined || endAtomIndex === undefined) {
    return [];
  }

  return [{ ...bond, startAtomIndex, endAtomIndex }];
}

function remapPolyhedron(
  polyhedron: PolyhedronSpec,
  atomIndexMap: ReadonlyMap<number, number>,
): PolyhedronSpec[] {
  const hullAtomIndices: number[] = [];
  for (const atomIndex of polyhedron.hullAtomIndices) {
    const visibleAtomIndex = atomIndexMap.get(atomIndex);
    if (visibleAtomIndex === undefined) {
      return [];
    }
    hullAtomIndices.push(visibleAtomIndex);
  }

  const centerAtomIndex = atomIndexMap.get(polyhedron.centerAtomIndex);
  if (centerAtomIndex === undefined) {
    return [];
  }

  return [{ ...polyhedron, centerAtomIndex, hullAtomIndices }];
}

import { Vector3 } from "three";

export { atomRadiusForModel } from "../model/elementRadii";
import {
  DEFAULT_PERIODIC_CELL_RANGE,
  type PeriodicCellRange,
} from "../model/periodicReplication";
import { withDefaultCellVectors, type VectorTuple } from "./viewMath";

export const BOND_RADIUS = 0.1;
export const CELL_FRAME_COLOR = "#444444";
export const CELL_FRAME_LINE_WIDTH_PIXELS = 1;

export function cellCenter(
  vectors: VectorTuple[],
  cellRange: PeriodicCellRange = DEFAULT_PERIODIC_CELL_RANGE,
): Vector3 {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);

  return new Vector3(...vectorA)
    .multiplyScalar(axisBoundaryMidpoint(cellRange.a))
    .add(new Vector3(...vectorB).multiplyScalar(axisBoundaryMidpoint(cellRange.b)))
    .add(new Vector3(...vectorC).multiplyScalar(axisBoundaryMidpoint(cellRange.c)));
}

export function cellCorners(
  vectors: VectorTuple[],
  cellRange: PeriodicCellRange = DEFAULT_PERIODIC_CELL_RANGE,
): Vector3[] {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const a = new Vector3(...vectorA);
  const b = new Vector3(...vectorB);
  const c = new Vector3(...vectorC);
  const aBounds = [cellRange.a.from, cellRange.a.to + 1];
  const bBounds = [cellRange.b.from, cellRange.b.to + 1];
  const cBounds = [cellRange.c.from, cellRange.c.to + 1];

  const corners: Vector3[] = [];
  for (const aOffset of aBounds) {
    for (const bOffset of bBounds) {
      for (const cOffset of cBounds) {
        corners.push(
          a
            .clone()
            .multiplyScalar(aOffset)
            .add(b.clone().multiplyScalar(bOffset))
            .add(c.clone().multiplyScalar(cOffset)),
        );
      }
    }
  }
  return corners;
}

export function cellFrameLinePositions(
  vectors: VectorTuple[],
  cellRange: PeriodicCellRange = DEFAULT_PERIODIC_CELL_RANGE,
): number[] {
  if (isSingleOriginCell(cellRange)) {
    return singleCellFrameLinePositions(vectors);
  }

  const [rawVectorA, rawVectorB, rawVectorC] = withDefaultCellVectors(vectors);
  const vectorA = new Vector3(...rawVectorA);
  const vectorB = new Vector3(...rawVectorB);
  const vectorC = new Vector3(...rawVectorC);
  const positions: number[] = [];

  for (let b = cellRange.b.from; b <= cellRange.b.to + 1; b += 1) {
    for (let c = cellRange.c.from; c <= cellRange.c.to + 1; c += 1) {
      positions.push(
        ...vectorEdge(
          latticePoint(vectorA, vectorB, vectorC, cellRange.a.from, b, c),
          latticePoint(vectorA, vectorB, vectorC, cellRange.a.to + 1, b, c),
        ),
      );
    }
  }
  for (let a = cellRange.a.from; a <= cellRange.a.to + 1; a += 1) {
    for (let c = cellRange.c.from; c <= cellRange.c.to + 1; c += 1) {
      positions.push(
        ...vectorEdge(
          latticePoint(vectorA, vectorB, vectorC, a, cellRange.b.from, c),
          latticePoint(vectorA, vectorB, vectorC, a, cellRange.b.to + 1, c),
        ),
      );
    }
  }
  for (let a = cellRange.a.from; a <= cellRange.a.to + 1; a += 1) {
    for (let b = cellRange.b.from; b <= cellRange.b.to + 1; b += 1) {
      positions.push(
        ...vectorEdge(
          latticePoint(vectorA, vectorB, vectorC, a, b, cellRange.c.from),
          latticePoint(vectorA, vectorB, vectorC, a, b, cellRange.c.to + 1),
        ),
      );
    }
  }

  return positions;
}

function singleCellFrameLinePositions(vectors: VectorTuple[]): number[] {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const origin = new Vector3(0, 0, 0);
  const a = new Vector3(...vectorA);
  const b = new Vector3(...vectorB);
  const c = new Vector3(...vectorC);
  const ab = a.clone().add(b);
  const ac = a.clone().add(c);
  const bc = b.clone().add(c);
  const abc = a.clone().add(b).add(c);

  return [
    ...vectorEdge(origin, a),
    ...vectorEdge(origin, b),
    ...vectorEdge(origin, c),
    ...vectorEdge(a, ab),
    ...vectorEdge(a, ac),
    ...vectorEdge(b, ab),
    ...vectorEdge(b, bc),
    ...vectorEdge(c, ac),
    ...vectorEdge(c, bc),
    ...vectorEdge(ab, abc),
    ...vectorEdge(ac, abc),
    ...vectorEdge(bc, abc),
  ];
}

export function centeredCellGroupPosition(
  vectors: VectorTuple[],
  cellRange: PeriodicCellRange = DEFAULT_PERIODIC_CELL_RANGE,
): VectorTuple {
  const center = cellCenter(vectors, cellRange);
  return [-center.x, -center.y, -center.z];
}

function axisBoundaryMidpoint(range: { from: number; to: number }): number {
  return (range.from + range.to + 1) / 2;
}

function isSingleOriginCell(range: PeriodicCellRange): boolean {
  return [range.a, range.b, range.c].every(
    (axis) => axis.from === 0 && axis.to === 0,
  );
}

function latticePoint(
  vectorA: Vector3,
  vectorB: Vector3,
  vectorC: Vector3,
  a: number,
  b: number,
  c: number,
): Vector3 {
  return vectorA
    .clone()
    .multiplyScalar(a)
    .add(vectorB.clone().multiplyScalar(b))
    .add(vectorC.clone().multiplyScalar(c));
}

function vectorEdge(
  start: Vector3,
  end: Vector3,
): [number, number, number, number, number, number] {
  return [start.x, start.y, start.z, end.x, end.y, end.z];
}

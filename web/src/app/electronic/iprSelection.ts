import type { IprAtomContribution } from "../../api/electronic";

export type IprClusterCriterion =
  | { mode: "composition"; threshold: number }
  | { mode: "top-k"; topK: number };

export interface RankedIprContribution extends IprAtomContribution {
  rank: number;
  cumulativeComposition: number;
  included: boolean;
}

export interface IprClusterSelection {
  rows: RankedIprContribution[];
  siteIndices: number[];
  includedComposition: number;
  includedIprContribution: number;
}

const COMPOSITION_TOLERANCE = 1e-12;
export const IPR_CONTRIBUTION_CACHE_CAPACITY = 8;

export class IprContributionCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(
    private readonly capacity = IPR_CONTRIBUTION_CACHE_CAPACITY,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError("IPR contribution cache capacity must be a positive integer.");
    }
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Rank atomic composition deterministically and apply the requested cluster
 * criterion. The composition criterion takes the shortest positive-weight
 * prefix whose cumulative composition reaches the requested threshold.
 */
export function selectIprCluster(
  contributions: readonly IprAtomContribution[],
  criterion: IprClusterCriterion,
): IprClusterSelection {
  const ordered = [...contributions].sort(
    (left, right) =>
      right.composition - left.composition || left.siteIndex - right.siteIndex,
  );
  const positiveCount = ordered.reduce(
    (count, entry) => count + (entry.composition > 0 ? 1 : 0),
    0,
  );

  let includedCount = 0;
  if (criterion.mode === "top-k") {
    includedCount = Math.min(
      positiveCount,
      Math.max(0, Math.floor(Number.isFinite(criterion.topK) ? criterion.topK : 0)),
    );
  } else if (positiveCount > 0) {
    const target = Math.min(1, Math.max(0, criterion.threshold));
    let cumulative = 0;
    for (const entry of ordered) {
      if (entry.composition <= 0 || cumulative + COMPOSITION_TOLERANCE >= target) {
        break;
      }
      cumulative += entry.composition;
      includedCount += 1;
    }
  }

  let cumulativeComposition = 0;
  let includedComposition = 0;
  let includedIprContribution = 0;
  const siteIndices: number[] = [];
  const rows = ordered.map((entry, index): RankedIprContribution => {
    cumulativeComposition += entry.composition;
    const included = index < includedCount;
    if (included) {
      siteIndices.push(entry.siteIndex);
      includedComposition += entry.composition;
      includedIprContribution += entry.iprContribution;
    }
    return {
      ...entry,
      rank: index + 1,
      cumulativeComposition,
      included,
    };
  });

  return {
    rows,
    siteIndices,
    includedComposition,
    includedIprContribution,
  };
}

export function iprCriterionSignature(
  stateId: string,
  criterion: IprClusterCriterion,
): string {
  return criterion.mode === "composition"
    ? `${stateId}:composition:${criterion.threshold}`
    : `${stateId}:top-k:${criterion.topK}`;
}

export const IPR_CONTRIBUTION_ROW_HEIGHT_PX = 28;
export const IPR_CONTRIBUTION_LIST_HEIGHT_PX = 224;
const IPR_CONTRIBUTION_OVERSCAN_ROWS = 3;

export interface IprContributionWindow {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

export function virtualIprContributionWindow(
  rowCount: number,
  scrollTop: number,
  viewportHeight = IPR_CONTRIBUTION_LIST_HEIGHT_PX,
): IprContributionWindow {
  const safeCount = Math.max(0, Math.floor(rowCount));
  const firstVisible = Math.max(0, Math.floor(scrollTop / IPR_CONTRIBUTION_ROW_HEIGHT_PX));
  const visibleCount = Math.ceil(viewportHeight / IPR_CONTRIBUTION_ROW_HEIGHT_PX);
  const start = Math.max(0, firstVisible - IPR_CONTRIBUTION_OVERSCAN_ROWS);
  const end = Math.min(
    safeCount,
    firstVisible + visibleCount + IPR_CONTRIBUTION_OVERSCAN_ROWS,
  );
  return {
    start,
    end,
    offsetTop: start * IPR_CONTRIBUTION_ROW_HEIGHT_PX,
    totalHeight: safeCount * IPR_CONTRIBUTION_ROW_HEIGHT_PX,
  };
}

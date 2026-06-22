import type { ReactNode } from "react";

export function renderHermannMauguin(symbol: string) {
  const nodes: ReactNode[] = [];
  let plainStart = 0;
  let index = 0;

  while (index < symbol.length) {
    const current = symbol[index] ?? "";
    const next = symbol[index + 1] ?? "";
    if (current === "-" && /\d/.test(next)) {
      if (plainStart < index) {
        nodes.push(symbol.slice(plainStart, index));
      }
      nodes.push(
        <span
          key={`overline-${index}`}
          className="hm-overline-digit"
          aria-label={`overline ${next}`}
        >
          {next}
        </span>,
      );
      index += 2;
      plainStart = index;
      continue;
    }

    if (current === "_" && /\d/.test(next)) {
      if (plainStart < index) {
        nodes.push(symbol.slice(plainStart, index));
      }
      nodes.push(
        <sub key={`subscript-${index}`} className="text-[0.68em] leading-none">
          {next}
        </sub>,
      );
      index += 2;
      plainStart = index;
      continue;
    }

    index += 1;
  }

  if (nodes.length === 0) {
    return symbol;
  }
  if (plainStart < symbol.length) {
    nodes.push(symbol.slice(plainStart));
  }

  return nodes;
}

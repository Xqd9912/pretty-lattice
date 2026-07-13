import { describe, expect, test } from "bun:test";

import { buildCsv, slugify } from "../src/app/analysis/chartExport";

describe("buildCsv", () => {
  test("emits a header row followed by column-major values", () => {
    const csv = buildCsv([
      { header: "r", values: [1, 2, 3] },
      { header: "g(r)", values: [0.1, 0.2, 0.3] },
    ]);
    expect(csv).toBe("r,g(r)\n1,0.1\n2,0.2\n3,0.3");
  });

  test("pads ragged columns with blanks up to the longest column", () => {
    const csv = buildCsv([
      { header: "dos_energy", values: [-1, 0, 1] },
      { header: "ipr_energy", values: [0.5] },
    ]);
    expect(csv).toBe("dos_energy,ipr_energy\n-1,0.5\n0,\n1,");
  });

  test("quotes values containing commas, quotes or newlines", () => {
    const csv = buildCsv([
      { header: "label", values: ["Ge-Se", 'a"b', "c,d"] },
    ]);
    expect(csv).toBe('label\nGe-Se\n"a""b"\n"c,d"');
  });

  test("returns just the header row when columns have no values", () => {
    expect(buildCsv([{ header: "x", values: [] }])).toBe("x");
  });
});

describe("slugify", () => {
  test("lowercases and collapses non-alphanumerics to single dashes", () => {
    expect(slugify("Pair distribution g(r)")).toBe("pair-distribution-g-r");
    expect(slugify("ICOHP per bond")).toBe("icohp-per-bond");
  });

  test("trims leading and trailing dashes and falls back to 'chart'", () => {
    expect(slugify("  ρ / ρ̄  ")).toBe("chart");
    expect(slugify("")).toBe("chart");
  });
});

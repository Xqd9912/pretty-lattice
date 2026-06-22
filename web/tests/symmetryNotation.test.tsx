import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderHermannMauguin } from "../src/app/symmetryNotation";

describe("renderHermannMauguin", () => {
  test("subscripts only the single digit after an underscore", () => {
    const markup = renderToStaticMarkup(<>{renderHermannMauguin("P2_13")}</>);

    expect(markup).toContain('P2<sub class="text-[0.68em] leading-none">1</sub>3');
    expect(markup).not.toContain(">13</sub>");
  });
});

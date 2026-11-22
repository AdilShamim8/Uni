import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { analyticsEnabled, setAnalyticsEnabled } from "@/lib/analytics";
import { setLocale } from "@/lib/i18n";
import { AnalyticsRow } from "./AnalyticsRow";

function row(simple = false): string {
  return renderToStaticMarkup(createElement(AnalyticsRow, { simple }));
}

afterEach(() => {
  setAnalyticsEnabled(false);
  setLocale("en");
  localStorage.clear();
});

describe("the analytics row", () => {
  it("titles the row and links the doc", () => {
    const html = row();
    expect(html).toContain("Usage analytics");
    expect(html).toContain('href="https://github.com/AdilShamim8/Uni/blob/main/docs/analytics.md"');
  });

  it("words the simple-mode row with its own subtitle and link text", () => {
    const html = row(true);
    expect(html).not.toEqual(row());
    expect(html).toContain("Send usage analytics");
  });

  it("renders the switch off when analytics is off, on when it is on", () => {
    setAnalyticsEnabled(false);
    const off = renderToStaticMarkup(createElement(AnalyticsRow, {}));
    expect(off).toContain('aria-checked="false"');
    setAnalyticsEnabled(true);
    const on = renderToStaticMarkup(createElement(AnalyticsRow, {}));
    expect(on).toContain('aria-checked="true"');
    expect(analyticsEnabled()).toBe(true);
  });

  it("keeps the aria label on the switch", () => {
    expect(row()).toContain('aria-label="Send usage analytics"');
  });
});

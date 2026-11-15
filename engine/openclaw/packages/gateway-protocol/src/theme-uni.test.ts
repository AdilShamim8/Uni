import { describe, expect, it } from "vitest";
import { BUILTIN_THEMES, resolveThemeBranding } from "./theme.js";
import { BUILTIN_THEME_IDS, isBuiltinThemeId } from "./theme-ids.js";

describe("uni builtin theme", () => {
  it("is registered as a builtin theme id", () => {
    expect(BUILTIN_THEME_IDS).toContain("uni");
    expect(isBuiltinThemeId("uni")).toBe(true);
  });

  it("is a builtin catalog entry with light and dark modes", () => {
    const uni = BUILTIN_THEMES.find((theme) => theme.id === "uni");
    expect(uni).toBeDefined();
    expect(uni?.source).toBe("builtin");
    expect(uni?.modes).toEqual(["light", "dark"]);
    expect(uni?.name).toBe("Uni");
  });

  it("resolves quiet branding defaults without the mascot", () => {
    const branding = resolveThemeBranding(BUILTIN_THEMES.find((theme) => theme.id === "uni"));
    expect(branding.mascot).toBe("none");
    expect(branding.brandIcon).toBe("mark");
    expect(branding.workingIndicator).toBe("dots");
    expect(branding.lobsterdex).toBe(false);
  });
});

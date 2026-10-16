import { describe, expect, test } from "bun:test";
import {
  fallbackModels, isProviderId, modelTier, PROVIDERS,
} from "@/lib/providers";

describe("provider registry", () => {
  test("covers the six named providers plus custom", () => {
    for (const id of ["openai", "anthropic", "gemini", "openrouter", "groq", "mistral", "custom"]) {
      expect(isProviderId(id)).toBe(true);
      expect(PROVIDERS[id as keyof typeof PROVIDERS]).toBeDefined();
    }
    expect(isProviderId("unknown")).toBe(false);
  });

  test("registry entries carry everything the UI needs", () => {
    for (const meta of Object.values(PROVIDERS)) {
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.docsUrl.startsWith("https://")).toBe(true);
      expect(meta.accent.startsWith("#")).toBe(true);
    }
  });

  test("custom providers require a base URL", () => {
    expect(PROVIDERS.custom.requiresBaseUrl).toBe(true);
    expect(PROVIDERS.openai.requiresBaseUrl ?? false).toBe(false);
  });
});

describe("model tier heuristic", () => {
  test("fast tier: small, cheap, quick models", () => {
    expect(modelTier("gpt-4o-mini")).toBe("fast");
    expect(modelTier("claude-3-5-haiku-20241022")).toBe("fast");
    expect(modelTier("gemini-2.0-flash")).toBe("fast");
    expect(modelTier("mistral-small-latest")).toBe("fast");
  });

  test("regression: 'gemini' contains 'mini' but is not a fast-tier signal", () => {
    expect(modelTier("gemini-2.5-pro")).toBe("powerful");
    expect(modelTier("gemini-1.5-pro")).toBe("other"); // pre-2.5 pro, unclassified
    expect(modelTier("gemini-2.0-flash")).toBe("fast"); // flash still wins
  });

  test("powerful tier: frontier models", () => {
    expect(modelTier("gpt-4o")).toBe("powerful");
    expect(modelTier("claude-sonnet-4-20250514")).toBe("powerful");
    expect(modelTier("gemini-2.5-pro")).toBe("powerful");
    expect(modelTier("llama-3.3-70b-versatile")).toBe("powerful");
  });

  test("unknown shapes fall through safely", () => {
    expect(modelTier("some-new-model-x")).toBe("other");
  });
});

describe("fallback catalogs", () => {
  test("every named provider has a labeled fallback list", () => {
    for (const id of ["openai", "anthropic", "gemini", "openrouter", "groq", "mistral"] as const) {
      const models = fallbackModels(id);
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m.source).toBe("fallback");
        expect(m.id.length).toBeGreaterThan(0);
      }
    }
  });

  test("custom providers have no fallback (base URL is required)", () => {
    expect(fallbackModels("custom")).toEqual([]);
  });
});

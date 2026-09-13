import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PREFS } from "@/lib/constants";
import { loadPrefs, loadSavedRange, PREFS_KEY, RANGE_KEY, savePrefs, saveRange } from "@/lib/persistence";

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("range", () => {
    it("returns null when unset", () => {
      expect(loadSavedRange()).toBeNull();
    });

    it("round-trips a valid range", () => {
      saveRange({ lo: 48, hi: 72 });
      expect(loadSavedRange()).toEqual({ lo: 48, hi: 72 });
    });

    it("returns null for invalid stored shapes", () => {
      localStorage.setItem(RANGE_KEY, "not json");
      expect(loadSavedRange()).toBeNull();
      localStorage.setItem(RANGE_KEY, JSON.stringify({ lo: "x", hi: 60 }));
      expect(loadSavedRange()).toBeNull();
      localStorage.setItem(RANGE_KEY, JSON.stringify({ lo: 70, hi: 50 }));
      expect(loadSavedRange()).toBeNull();
    });
  });

  describe("prefs", () => {
    it("returns defaults when unset", () => {
      expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    });

    it("round-trips saved prefs", () => {
      const custom = { ...DEFAULT_PREFS, tol: "18" as const, direction: "down" as const };
      savePrefs(custom);
      expect(loadPrefs()).toEqual(custom);
    });

    it("falls back to defaults on garbage input, preserving any valid keys", () => {
      localStorage.setItem(PREFS_KEY, "not json");
      expect(loadPrefs()).toEqual(DEFAULT_PREFS);

      // Partial: valid keys survive, missing ones default.
      localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: "ear" }));
      expect(loadPrefs().mode).toBe("ear");
      expect(loadPrefs().tol).toBe(DEFAULT_PREFS.tol);
    });
  });
});

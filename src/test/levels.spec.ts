import { describe, expect, it } from "vitest";

import { LEVELS } from "@/lib/levels";

describe("LEVELS", () => {
  it("has 9 levels", () => {
    expect(LEVELS).toHaveLength(9);
  });

  it("first level is single-note (empty steps)", () => {
    expect(LEVELS[0]?.steps).toEqual([]);
  });

  it("interval levels each drill an exact fixed semitone leap", () => {
    // Names → expected semitone steps (this is the parity spec).
    const expected: Record<string, readonly number[]> = {
      "2 · Minor 2nd (малая секунда)": [1],
      "3 · Major 2nd (большая секунда)": [2],
      "4 · Minor 3rd (малая терция)": [3],
      "5 · Major 3rd (большая терция)": [4],
      "6 · Perfect 4th (кварта)": [5],
      "7 · Perfect 5th (квинта)": [7],
      "8 · Octave (октава)": [12],
      "9 · Major triad (мажорное трезвучие)": [4, 3],
    };
    for (const [name, steps] of Object.entries(expected)) {
      const lv = LEVELS.find((l) => l.name === name);
      expect(lv, name).toBeDefined();
      expect(lv?.steps).toEqual(steps);
    }
  });
});

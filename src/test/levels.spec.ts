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
    // Level key → expected semitone steps (this is the parity spec).
    const expected: Record<string, readonly number[]> = {
      minor2: [1],
      major2: [2],
      minor3: [3],
      major3: [4],
      perfect4: [5],
      perfect5: [7],
      octave: [12],
      majorTriad: [4, 3],
    };
    for (const [key, steps] of Object.entries(expected)) {
      const lv = LEVELS.find((l) => l.key === key);
      expect(lv, key).toBeDefined();
      expect(lv?.steps).toEqual(steps);
    }
  });
});

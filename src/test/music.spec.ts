import { describe, expect, it } from "vitest";

import { A4, A4_MIDI, freqToMidiFloat, midiToFreq, midiToName, RANGE_BASE, rangeBounds } from "@/lib/music";

describe("music helpers", () => {
  it("midiToFreq: A4 (midi 69) → 440 Hz", () => {
    expect(midiToFreq(A4_MIDI)).toBeCloseTo(A4);
  });

  it("midiToFreq: one octave up doubles frequency", () => {
    expect(midiToFreq(A4_MIDI + 12)).toBeCloseTo(A4 * 2);
    expect(midiToFreq(A4_MIDI - 12)).toBeCloseTo(A4 / 2);
  });

  it("freqToMidiFloat is the inverse of midiToFreq", () => {
    for (const midi of [30, 45, 60, 69, 84, 100]) {
      expect(freqToMidiFloat(midiToFreq(midi))).toBeCloseTo(midi);
    }
  });

  it("freqToMidiFloat returns fractional MIDI for detuned pitches", () => {
    // 50 cents above A4 = midi 69.5
    const halfSemitone = midiToFreq(A4_MIDI) * Math.pow(2, 0.5 / 12);
    expect(freqToMidiFloat(halfSemitone)).toBeCloseTo(69.5);
  });

  it("midiToName: canonical notes", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(69)).toBe("A4");
    expect(midiToName(0)).toBe("C-1");
    expect(midiToName(21)).toBe("A0");
    expect(midiToName(70)).toBe("A#4");
  });

  it("midiToName handles negative midi via modulo (defensive)", () => {
    expect(midiToName(-1)).toBe("B-2");
  });

  it("RANGE_BASE has expected mid-voice starts", () => {
    expect(RANGE_BASE.low).toBe(45); // A2
    expect(RANGE_BASE.mid).toBe(55); // G3
    expect(RANGE_BASE.high).toBe(64); // E4
  });

  it("rangeBounds prefers measured values over base defaults", () => {
    expect(rangeBounds(50, 70, 55)).toEqual([50, 70]);
    expect(rangeBounds(null, null, 55)).toEqual([48, 67]);
  });
});

// Musical helpers: MIDI ↔ frequency, note names, comfortable-range defaults.
// Kept as pure functions so the audio engine, hooks, and canvas all share them.

export const A4 = 440;
export const A4_MIDI = 69;
export const SEMITONES_PER_OCTAVE = 12;

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export const CENTS_PER_SEMITONE = 100;

// Signed cents between a sung pitch and a reference note (+ sharp, − flat). In
// any-octave mode the interval folds to the nearest octave (mod 12), so C2 counts
// as landing on C4.
export function signedCentsBetween(sungMidi: number, noteMidi: number, anyOctave: boolean): number {
  let semis = sungMidi - noteMidi;
  if (anyOctave) {
    semis = ((semis % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
    if (semis > SEMITONES_PER_OCTAVE / 2) semis -= SEMITONES_PER_OCTAVE;
  }
  return semis * CENTS_PER_SEMITONE;
}

// Absolute cents — magnitude of the deviation, for tolerance checks.
export function centsBetween(sungMidi: number, noteMidi: number, anyOctave: boolean): number {
  return Math.abs(signedCentsBetween(sungMidi, noteMidi, anyOctave));
}

// MIDI note number (69 = A4) → frequency in Hz.
export function midiToFreq(midi: number): number {
  return A4 * Math.pow(2, (midi - A4_MIDI) / SEMITONES_PER_OCTAVE);
}

// Hz → fractional MIDI (returns e.g. 69.4 for slightly-sharp A4).
export function freqToMidiFloat(freq: number): number {
  return A4_MIDI + SEMITONES_PER_OCTAVE * Math.log2(freq / A4);
}

export function midiToName(midi: number): string {
  const idx = ((midi % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
  const octave = midiToOctave(midi);
  return `${NOTE_NAMES[idx]}${octave}`;
}

// Scientific-pitch octave number for a MIDI note (C4 = middle C = octave 4).
export function midiToOctave(midi: number): number {
  return Math.floor(midi / SEMITONES_PER_OCTAVE) - 1;
}

// The [lo, hi] MIDI bounds of one octave, clamped to the singable range.
// Returns null if that octave doesn't overlap the range at all.
export function octaveBoundsWithin(octave: number, rangeLo: number, rangeHi: number): readonly [number, number] | null {
  const octLo = (octave + 1) * SEMITONES_PER_OCTAVE; // C of this octave
  const octHi = octLo + SEMITONES_PER_OCTAVE - 1; // B of this octave
  const lo = Math.max(octLo, rangeLo);
  const hi = Math.min(octHi, rangeHi);
  return lo <= hi ? [lo, hi] : null;
}

export type VoiceRange = "low" | "mid" | "high";

// Comfortable starting MIDI per voice range — kept mid-voice so intervals stay singable.
export const RANGE_BASE: Record<VoiceRange, number> = {
  low: 45 /* A2 */,
  mid: 55 /* G3 */,
  high: 64 /* E4 */,
};

export function randInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function pick<T>(arr: readonly T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error("pick() from empty array");
  return item;
}

// Singable window shared by the exercise generator and the coverage map, so
// the notes you're asked to sing are exactly the ones on the map.
export function rangeBounds(loMidi: number | null, hiMidi: number | null, base: number): readonly [number, number] {
  const DEFAULT_LOW_OFFSET = 7;
  const DEFAULT_HIGH_OFFSET = 12;
  const lo = loMidi ?? base - DEFAULT_LOW_OFFSET;
  const hi = hiMidi ?? base + DEFAULT_HIGH_OFFSET;
  return [lo, hi];
}

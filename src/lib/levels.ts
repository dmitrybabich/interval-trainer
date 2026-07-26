// Each level drills ONE exact interval — a fixed number of semitones, so the
// interval always has the same "feel." That's the whole point: you memorize what
// a major third (say) sounds/feels like, not a random gap. steps = list of exact
// semitone leaps between consecutive notes; [] = single sustained note.
//
// Display names/descriptions live in the i18n locales under `levels.<key>`; only
// the tuned `steps` (the parity spec) live here.

export interface LevelDef {
  readonly key: string;
  readonly steps: readonly number[];
}

export const LEVELS: readonly LevelDef[] = [
  { key: "single", steps: [] },
  { key: "minor2", steps: [1] },
  { key: "major2", steps: [2] },
  { key: "minor3", steps: [3] },
  { key: "major3", steps: [4] },
  { key: "perfect4", steps: [5] },
  { key: "perfect5", steps: [7] },
  { key: "octave", steps: [12] },
  { key: "majorTriad", steps: [4, 3] },
];

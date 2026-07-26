// Each level drills ONE exact interval — a fixed number of semitones, so the
// interval always has the same "feel." That's the whole point: you memorize what
// a major third (say) sounds/feels like, not a random gap. steps = list of exact
// semitone leaps between consecutive notes; [] = single sustained note.

export interface LevelDef {
  readonly name: string;
  readonly desc: string;
  readonly steps: readonly number[];
}

export const LEVELS: readonly LevelDef[] = [
  { name: "1 · Single note (прима)", desc: "Find one pitch and hold it.", steps: [] },
  { name: "2 · Minor 2nd (малая секунда)", desc: "Half step — 1 semitone.", steps: [1] },
  { name: "3 · Major 2nd (большая секунда)", desc: "Whole tone — 2 semitones.", steps: [2] },
  { name: "4 · Minor 3rd (малая терция)", desc: "3 semitones.", steps: [3] },
  { name: "5 · Major 3rd (большая терция)", desc: "4 semitones.", steps: [4] },
  { name: "6 · Perfect 4th (кварта)", desc: "5 semitones.", steps: [5] },
  { name: "7 · Perfect 5th (квинта)", desc: "7 semitones.", steps: [7] },
  { name: "8 · Octave (октава)", desc: "12 semitones.", steps: [12] },
  { name: "9 · Major triad (мажорное трезвучие)", desc: "Maj 3rd then min 3rd (do-mi-sol).", steps: [4, 3] },
];

// The tutorial ladder: an ordered ramp of "rungs" you climb per interval, easy
// to hard. Each rung is a preset over the same exercise engine — what changes is
// the root (fixed vs random), what reference plays, whether the passing scale
// tones are walked, and whether the guide drone is on. Climb after CLIMB_REPS
// clean reps (rung 1 climbs on a tap, since there's nothing to sing).
//
// This is spec data, not logic — the hook reads these flags in buildExercise.

export type RungShape = "leap" | "walk";

export interface Rung {
  readonly key: string;
  readonly fixedRoot: boolean; // pin the root across reps (rungs 1–3) vs. random
  readonly shape: RungShape; // "walk" fills diatonic passing tones up to the target
  readonly playAnchor: boolean; // rung 1: prime with the song snippet
  readonly playReference: boolean; // play the target sequence before you sing
  readonly guide: boolean; // hold the guide drone under note 1
  readonly sing: boolean; // rung 1 is listen-only
  // Foundation-drill rungs only: absolute scale degrees (semitones) from a fixed
  // tonic, forming the target sequence directly. When set, this overrides the
  // interval `steps` machinery — the notes ARE tonic+degree.
  readonly degrees?: readonly number[];
}

// Clean reps needed to climb to the next rung.
export const CLIMB_REPS = 3;

export const LADDER: readonly Rung[] = [
  { key: "listen", fixedRoot: true, shape: "leap", playAnchor: true, playReference: true, guide: false, sing: false },
  { key: "walk", fixedRoot: true, shape: "walk", playAnchor: false, playReference: true, guide: true, sing: true },
  { key: "echo", fixedRoot: true, shape: "leap", playAnchor: false, playReference: true, guide: true, sing: true },
  { key: "transpose", fixedRoot: false, shape: "leap", playAnchor: false, playReference: true, guide: true, sing: true },
  { key: "cold", fixedRoot: false, shape: "leap", playAnchor: false, playReference: false, guide: false, sing: true },
];

// Foundation drill (single-note level): the pitch-matching regimen — master one
// key (1 → 3 → 5 → the arpeggio) before the tonic climbs a semitone. Degrees are
// scale steps of the major triad: 1=root, 3=major third (+4), 5=fifth (+7).
const FOUNDATION_DEFAULTS = {
  fixedRoot: true,
  shape: "leap",
  playAnchor: false,
  playReference: true,
  guide: false,
  sing: true,
} as const;

export const FOUNDATION: readonly Rung[] = [
  { key: "one", degrees: [0], ...FOUNDATION_DEFAULTS },
  { key: "three", degrees: [4], ...FOUNDATION_DEFAULTS },
  { key: "oneThreeOne", degrees: [0, 4, 0], ...FOUNDATION_DEFAULTS },
  { key: "five", degrees: [7], ...FOUNDATION_DEFAULTS },
  { key: "oneThreeFive", degrees: [0, 4, 7], ...FOUNDATION_DEFAULTS },
  { key: "arpeggio", degrees: [0, 4, 7, 4, 0], ...FOUNDATION_DEFAULTS },
];

// Highest degree in the foundation drill — the tonic can't climb past hi minus
// this, or the top note would fall off the singable range.
export const FOUNDATION_SPAN = Math.max(...FOUNDATION.flatMap((r) => r.degrees ?? [0]));

// The single-note level runs the foundation drill; single-interval levels run the
// interval ladder. (Flat levels never reach here.)
export function ladderFor(levelKey: string): readonly Rung[] {
  return levelKey === "single" ? FOUNDATION : LADDER;
}

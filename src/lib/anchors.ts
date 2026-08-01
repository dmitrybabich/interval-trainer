// Song anchors: a short, recognizable melody used as the rung-1 "listen" primer
// so a new ear hooks the interval to a tune it already knows. All the data —
// notes, timings, AND localized names — lives in one place, src/data/anchors.json,
// so adding or removing a song is a single edit to that file with no i18n churn.
//
// Each note is an offset in semitones from the root plus a relative duration in
// beats (so the rhythm is recognizable, not a robotic drip). `intervalAt` names
// the two note indices whose leap IS the target interval — NOT assumed to be the
// first two, because most tunes don't open on the interval (Happy Birthday starts
// on a repeated note; Twinkle's fifth is do→sol, its 2nd and 3rd notes). An
// interval with no anchors falls back to the plain primer (root, then interval).
//
// Note on trust: the classic mnemonics (Jaws, Twinkle, Somewhere, Bride) are
// well-verified; the added tunes are best-effort transcriptions — the picker
// exists precisely so a shaky one is skippable rather than forced on you.

import anchorsData from "@/data/anchors.json";
import { SEC_PER_BEAT } from "@/lib/constants";

export interface AnchorNote {
  readonly offset: number; // semitones from the root
  readonly beats: number; // relative duration
}

export interface Anchor {
  readonly key: string; // unique across all intervals — the saved-choice id
  readonly names: Readonly<Record<string, string>>; // localized display names, by lang code
  readonly notes: readonly AnchorNote[];
  readonly intervalAt: readonly [number, number]; // indices forming the interval
}

// Raw JSON shape: notes are [offset, beats] pairs, kept compact in the file.
interface RawAnchor {
  key: string;
  names: Record<string, string>;
  intervalAt: [number, number];
  notes: [number, number][];
}

// JSON widens tuples to arrays, so go through `unknown`; the RawAnchor shape is
// the contract the JSON must honor.
const RAW = anchorsData as unknown as Record<string, RawAnchor[]>;

function toAnchor(raw: RawAnchor): Anchor {
  return {
    key: raw.key,
    names: raw.names,
    intervalAt: raw.intervalAt,
    notes: raw.notes.map(([offset, beats]) => ({ offset, beats })),
  };
}

// Interval level key → its anchors, parsed once at module load.
const ANCHORS_BY_INTERVAL: Record<string, readonly Anchor[]> = Object.fromEntries(
  Object.entries(RAW).map(([interval, list]) => [interval, list.map(toAnchor)]),
);

// The anchor's display name in `lang`, falling back to English then the key.
export function anchorName(anchor: Anchor, lang: string): string {
  return anchor.names[lang] ?? anchor.names.en ?? anchor.key;
}

// Start time (ms from playback start) of each melody note — for driving the glyph
// playhead. Uses SEC_PER_BEAT so the highlight tracks the audio exactly. The
// bare-interval replay that follows the tune isn't animated here.
export function anchorNoteStartsMs(anchor: Anchor): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const n of anchor.notes) {
    starts.push(t * 1000);
    t += n.beats * SEC_PER_BEAT;
  }
  return starts;
}

// Every anchor for a given interval level (empty if none curated).
export function anchorsFor(levelKey: string): readonly Anchor[] {
  return ANCHORS_BY_INTERVAL[levelKey] ?? [];
}

// The chosen anchor for an interval: the saved pick if it's still a valid option,
// else the first (default). Returns undefined only when the interval has none.
export function resolveAnchor(levelKey: string, savedKey: string | undefined): Anchor | undefined {
  const list = anchorsFor(levelKey);
  return list.find((a) => a.key === savedKey) ?? list[0];
}

// Semitone positions of the major scale within one octave. Used to fill the
// "walk up to the target" passing tones for the scale-walk rung.
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12] as const;

/**
 * Diatonic passing-tone steps from the root up to `interval` semitones: the
 * major-scale degrees strictly between root and target, returned as the gaps
 * between consecutive stops (positive magnitudes; the caller applies direction).
 * A minor 2nd (or any interval with no degree in between) walks in one step.
 */
export function scaleWalkSteps(interval: number): number[] {
  const degrees = MAJOR_SCALE.filter((d) => d > 0 && d < interval);
  const stops = [0, ...degrees, interval];
  const steps: number[] = [];
  for (let i = 1; i < stops.length; i++) {
    const gap = stops[i] - stops[i - 1];
    steps.push(gap);
  }
  return steps;
}

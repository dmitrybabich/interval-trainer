import type { RefNote } from "@/components/WarmupRoll";

// Standard 6-string tuning as open-string MIDI numbers, low string (index 0) to high
// (index 5): E2 A2 D3 G3 B3 E4.
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64] as const;
export const MAX_FRET = 15;
// Open-string labels for the tab gutter, matching STANDARD_TUNING order (low→high).
export const STRING_LABELS = ["E", "A", "D", "G", "B", "e"] as const;

export interface FretPos {
  string: number; // index into the tuning (0 = lowest)
  fret: number; // 0 = open
}
export interface FretNote extends FretPos {
  t: number;
  midi: number;
  dur: number;
}

// Every place a pitch can be fingered within reach.
export function positionsForMidi(midi: number, tuning: readonly number[] = STANDARD_TUNING, maxFret = MAX_FRET): FretPos[] {
  const out: FretPos[] = [];
  for (let string = 0; string < tuning.length; string++) {
    const fret = midi - (tuning[string] ?? 0);
    if (fret >= 0 && fret <= maxFret) out.push({ string, fret });
  }
  return out;
}

// How costly it is to move the fretting hand from one position to the next. Fret
// distance dominates (that's the hand sliding along the neck); a gentle pull toward
// low frets breaks ties. String changes are free — using a neighbouring string at a
// similar fret is exactly how you keep consecutive notes close together.
const LOW_FRET_BIAS = 0.2;
function stepCost(prev: FretPos | null, cur: FretPos): number {
  const anchor = prev ? Math.abs(cur.fret - prev.fret) : cur.fret * 0.3;
  return anchor + LOW_FRET_BIAS * cur.fret;
}

// Cheapest way to arrive at `pos` from the previous note's candidates.
function bestTransition(prevList: readonly FretPos[], prevCost: readonly number[], pos: FretPos): { cost: number; prev: number } {
  let cost = Infinity;
  let prev = -1;
  for (let p = 0; p < prevList.length; p++) {
    const total = (prevCost[p] ?? Infinity) + stepCost(prevList[p], pos);
    if (total < cost) {
      cost = total;
      prev = p;
    }
  }
  return { cost, prev };
}

function argmin(row: readonly number[]): number {
  let best = Infinity;
  let idx = -1;
  for (let i = 0; i < row.length; i++) {
    if ((row[i] ?? Infinity) < best) {
      best = row[i] ?? Infinity;
      idx = i;
    }
  }
  return idx;
}

/**
 * Assign each note a fret position that minimises hand movement across the melody
 * (a Viterbi pass over the candidate positions). The result clusters the tune into
 * one hand area — notes land on adjacent strings at nearby frets instead of crawling
 * up a single string. Notes are returned in time order.
 */
export function assignFingering(
  notes: readonly RefNote[],
  tuning: readonly number[] = STANDARD_TUNING,
  maxFret = MAX_FRET,
): FretNote[] {
  const ordered = notes.toSorted((a, b) => a.t - b.t);
  const candidates = ordered.map((n) => positionsForMidi(n.midi, tuning, maxFret));

  // Forward pass: best cumulative cost to reach each candidate, with a back-pointer.
  const cost: number[][] = [];
  const back: number[][] = [];
  for (let i = 0; i < candidates.length; i++) {
    const here = candidates[i] ?? [];
    const prevList = candidates[i - 1] ?? [];
    const prevCost = cost[i - 1] ?? [];
    cost[i] = here.map((pos) => (i === 0 ? stepCost(null, pos) : bestTransition(prevList, prevCost, pos).cost));
    back[i] = here.map((pos) => (i === 0 ? -1 : bestTransition(prevList, prevCost, pos).prev));
  }

  // Backtrack from the cheapest final position.
  const out: FretNote[] = new Array(ordered.length);
  let idx = argmin(cost.at(-1) ?? []);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const note = ordered[i];
    const pos = (candidates[i] ?? [])[idx] ?? { string: 0, fret: 0 };
    out[i] = { t: note.t, midi: note.midi, dur: note.dur, string: pos.string, fret: pos.fret };
    idx = back[i]?.[idx] ?? -1;
    if (idx < 0 && i > 0) idx = 0; // notes with no reachable position fall back
  }
  return out;
}

// The fret span the assignment actually uses, so the view can zoom to the played
// region (plus a little air) instead of always drawing all 15 frets.
export function fretRange(notes: readonly FretNote[]): { loFret: number; hiFret: number } {
  const frets = notes.map((n) => n.fret);
  if (frets.length === 0) return { loFret: 0, hiFret: 5 };
  const lo = Math.min(...frets);
  const hi = Math.max(...frets);
  return { loFret: Math.max(0, lo - 1), hiFret: Math.max(hi + 1, lo + 4) };
}

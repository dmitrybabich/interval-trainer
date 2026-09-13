import type { SungSample } from "@/lib/attempts";
import { signedCentsBetween } from "@/lib/music";

// How far a sung frame's time may sit from the nearest reference point before we
// treat it as "no target here" (a reference gap — reverb tail, rest, breath).
const MAX_LOOKUP_GAP_S = 0.05;

// The reference pitch (MIDI) at time `t`, or null if the nearest reference point is
// unvoiced or too far away. Binary search — the contour is time-sorted.
export function refMidiAt(reference: readonly SungSample[], t: number): number | null {
  if (reference.length === 0) return null;
  let lo = 0;
  let hi = reference.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (reference[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  let best: SungSample | undefined;
  let bestDt = Infinity;
  for (const cand of [reference[lo], reference[lo - 1]]) {
    if (!cand) continue;
    const dt = Math.abs(cand.t - t);
    if (dt < bestDt) {
      bestDt = dt;
      best = cand;
    }
  }
  if (best?.midi == null || bestDt > MAX_LOOKUP_GAP_S) return null;
  return best.midi;
}

export interface ContourSummary {
  inTunePct: number; // fraction of scored frames within tolerance, 0..1
  biasCents: number; // mean signed cents (+ sharp, − flat) — are you consistently off?
  frames: number; // frames compared (both you and reference voiced)
}

export const EMPTY_CONTOUR_SUMMARY: ContourSummary = { inTunePct: 0, biasCents: 0, frames: 0 };

/**
 * Live contour scorer. Fed one sung frame at a time, it compares your pitch to the
 * reference curve at the same instant (clock-locked) and tracks how often you're
 * within tolerance and your average flat/sharp bias. Frames where either you or the
 * reference are unvoiced don't count — silence isn't wrong.
 */
export class ContourScorer {
  private reference: readonly SungSample[] = [];
  private tolCents = 50;
  private anyOctave = false;
  private frames = 0;
  private inTune = 0;
  private biasSum = 0;

  load(reference: readonly SungSample[], tolCents: number, anyOctave: boolean): void {
    this.reference = reference;
    this.tolCents = tolCents;
    this.anyOctave = anyOctave;
    this.reset();
  }

  reset(): void {
    this.frames = 0;
    this.inTune = 0;
    this.biasSum = 0;
  }

  record(sample: SungSample): void {
    if (sample.midi == null) return;
    const ref = refMidiAt(this.reference, sample.t);
    if (ref == null) return;
    const signed = signedCentsBetween(sample.midi, ref, this.anyOctave);
    this.frames += 1;
    this.biasSum += signed;
    if (Math.abs(signed) <= this.tolCents) this.inTune += 1;
  }

  snapshot(): ContourSummary {
    if (this.frames === 0) return EMPTY_CONTOUR_SUMMARY;
    return { inTunePct: this.inTune / this.frames, biasCents: this.biasSum / this.frames, frames: this.frames };
  }
}

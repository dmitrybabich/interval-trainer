import { PitchDetector } from "pitchy";

import type { RefNote } from "@/components/WarmupRoll";
import type { SungSample } from "@/lib/attempts";
import { decodeToMono } from "@/lib/audioDecode";
import { PITCH_HZ_MAX, PITCH_HZ_MIN } from "@/lib/constants";
import { freqToMidiFloat } from "@/lib/music";

// Flatten a note chart into a contour (a point every CONTOUR_STEP_S at the note's
// pitch), so note-based songs (built-ins, old uploads) score/render on the same
// contour path as pitchy-extracted references.
const CONTOUR_STEP_S = 0.05;
// Guard against pathological MIDI (a note with no note-off can carry a non-finite or
// enormous duration); without a cap the flatten loop would hang the main thread.
const MAX_STEPS_PER_NOTE = 4000; // 200s at the step — far beyond any real note
export function notesToContour(notes: readonly RefNote[]): SungSample[] {
  const points: SungSample[] = [];
  for (const n of notes) {
    const dur = Number.isFinite(n.dur) ? n.dur : 0;
    const steps = Math.min(Math.max(1, Math.ceil(dur / CONTOUR_STEP_S)), MAX_STEPS_PER_NOTE);
    for (let step = 0; step < steps; step++) points.push({ t: n.t + step * CONTOUR_STEP_S, midi: n.midi });
  }
  return points.toSorted((a, b) => a.t - b.t);
}

// Extraction runs offline, so we can afford a fine hop. 22050 Hz mono is plenty for
// voice; a 1024-sample window (~46 ms) reaches low male fundamentals, hopped every
// 512 (~23 ms) for a smooth curve without a huge point count.
const SAMPLE_RATE = 22050;
const WINDOW = 1024;
const HOP = 512;
// McLeod clarity gate. 0.6 keeps ~half of a wet/produced vocal voiced; a dry solo
// take clears it far more often. Higher (0.9) starves coverage on reverbed audio.
const CLARITY_MIN = 0.6;
const MEDIAN_WINDOW = 5; // odd — kills isolated octave slips without smearing edges
// Octave-repair window (~0.5s at this hop): fold each frame toward the local median
// so a sustained octave-down/up error snaps back to the real line.
const OCTAVE_WINDOW = 21;
const OCTAVE_TOL_SEMIS = 6;
const MAX_GAP_S = 0.08; // bridge only sub-breath gaps between same-ish pitches
const MAX_GAP_SEMIS = 2;
const FALLBACK_LO = 55;
const FALLBACK_HI = 67;

export interface ReferenceContour {
  points: SungSample[]; // f0 over time; midi null where unvoiced (rests, breaths)
  loMidi: number;
  hiMidi: number;
}

// Median-filter the voiced pitches in place (semitone domain). Isolated octave
// errors and spikes fall out; real vibrato/glides survive a 5-frame median.
function medianFilterMidi(points: SungSample[], win: number): void {
  const half = Math.floor(win / 2);
  const orig = points.map((p) => p.midi);
  for (let i = 0; i < points.length; i++) {
    if (orig[i] == null) continue;
    const near: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(orig.length - 1, i + half); j++) {
      const v = orig[j];
      if (v != null) near.push(v);
    }
    const sorted = near.toSorted((a, b) => a - b);
    const point = points[i];
    if (point) point.midi = sorted[Math.floor(sorted.length / 2)] ?? point.midi;
  }
}

// Fold each voiced frame to within OCTAVE_TOL_SEMIS of the local median, so a
// sustained octave error (the classic autocorrelation failure) snaps back to the
// real line without disturbing legitimate leaps under half an octave.
function repairOctaves(points: SungSample[], win: number): void {
  const half = Math.floor(win / 2);
  const orig = points.map((p) => p.midi);
  for (let i = 0; i < points.length; i++) {
    const cur = orig[i];
    if (cur == null) continue;
    const near: number[] = [];
    for (let j = Math.max(0, i - half); j <= Math.min(orig.length - 1, i + half); j++) {
      const v = orig[j];
      if (v != null) near.push(v);
    }
    const center = near.toSorted((a, b) => a - b)[Math.floor(near.length / 2)] ?? cur;
    let v = cur;
    while (v - center > OCTAVE_TOL_SEMIS) v -= 12;
    while (center - v > OCTAVE_TOL_SEMIS) v += 12;
    const point = points[i];
    if (point) point.midi = v;
  }
}

// Fill short unvoiced gaps between two similar pitches (a clipped consonant, not a
// real rest) by linear interpolation. Long or pitch-jumping gaps stay null so we
// never score the singer against a bridge we invented.
function interpolateShortGaps(points: SungSample[]): void {
  let i = 0;
  while (i < points.length) {
    if (points[i]?.midi != null) {
      i++;
      continue;
    }
    const gapStart = i;
    while (i < points.length && points[i]?.midi == null) i++;
    const before = points[gapStart - 1];
    const after = points[i];
    if (before?.midi == null || after?.midi == null) continue;
    const span = after.t - before.t;
    if (span > MAX_GAP_S || Math.abs(after.midi - before.midi) > MAX_GAP_SEMIS) continue;
    for (let idx = gapStart; idx < i; idx++) {
      const pt = points[idx];
      if (pt) pt.midi = before.midi + (after.midi - before.midi) * ((pt.t - before.t) / span);
    }
  }
}

/**
 * Extract a cleaned continuous pitch contour (the reference "tune") from an isolated
 * vocal, running pitchy frame-by-frame over the decoded buffer offline. No ML — the
 * same McLeod detector used live. Cleanup: clarity gate → median filter (octave-slip
 * repair) → short-gap interpolation.
 */
export async function extractReferenceContour(file: File, onProgress?: (pct: number) => void): Promise<ReferenceContour> {
  const audio = await decodeToMono(file, SAMPLE_RATE);
  const detector = PitchDetector.forFloat32Array(WINDOW);
  const buf = new Float32Array(WINDOW);
  const points: SungSample[] = [];
  const lastFrame = Math.max(0, Math.floor((audio.length - WINDOW) / HOP));

  for (let frame = 0; frame <= lastFrame; frame++) {
    const start = frame * HOP;
    buf.set(audio.subarray(start, start + WINDOW));
    const [freq, clarity] = detector.findPitch(buf, SAMPLE_RATE);
    const voiced = clarity >= CLARITY_MIN && freq > PITCH_HZ_MIN && freq < PITCH_HZ_MAX;
    points.push({ t: start / SAMPLE_RATE, midi: voiced ? freqToMidiFloat(freq) : null });
    if (onProgress && frame % 64 === 0) onProgress(lastFrame > 0 ? frame / lastFrame : 1);
  }

  medianFilterMidi(points, MEDIAN_WINDOW);
  repairOctaves(points, OCTAVE_WINDOW);
  interpolateShortGaps(points);

  const voicedMidi = points.map((p) => p.midi).filter((m): m is number => m != null);
  const lo = voicedMidi.length > 0 ? Math.floor(Math.min(...voicedMidi)) : FALLBACK_LO;
  const hi = voicedMidi.length > 0 ? Math.ceil(Math.max(...voicedMidi)) : FALLBACK_HI;
  return { points, loMidi: lo, hiMidi: hi === lo ? lo + 4 : hi };
}

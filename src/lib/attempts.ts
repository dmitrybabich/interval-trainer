import type { RefNote } from "@/components/WarmupRoll";
import { ATTEMPTS_STORE, idbRequest } from "@/lib/db";
import { centsBetween, signedCentsBetween } from "@/lib/music";

// One frame of your sung pitch, stamped against the song clock. Fractional MIDI so
// cents are exact; null when you weren't singing.
export interface SungSample {
  t: number;
  midi: number | null;
}

// A saved singing attempt — fully self-contained: the expected melody AND your
// performance, so it can be re-scored or compared on its own without any other
// record. Nothing derived (hit/accuracy/cents) is stored; it's all computed on read
// from these two arrays under whatever tolerance you pick then.
export interface Attempt {
  id: string;
  songId: string;
  songTitle: string;
  at: number; // epoch ms
  expected: readonly RefNote[];
  sung: readonly SungSample[];
}

export function newAttemptId(): string {
  return crypto.randomUUID();
}

// Don't save runs shorter than this fraction of the song — a quick pause or false
// start isn't worth cluttering history with.
export const MIN_SAVE_COVERAGE = 0.2;

// How far into the song the take reached, 0..1 (last sung sample vs the song's end).
export function coverageFraction(expected: readonly RefNote[], sung: readonly SungSample[]): number {
  const end = expected.reduce((max, n) => Math.max(max, n.t + n.dur), 0);
  const last = sung.at(-1)?.t ?? 0;
  return end > 0 ? Math.min(1, last / end) : 0;
}

// Cheap stable signature of a chart's notes, so attempts sung against the SAME
// expected melody can be aligned by index (a re-transcribe changes it → not comparable).
export function chartSignature(notes: readonly RefNote[]): string {
  let hash = 2166136261;
  for (const n of notes) {
    const key = `${n.midi}:${Math.round(n.t * 100)}:${Math.round(n.dur * 100)};`;
    for (let i = 0; i < key.length; i++) {
      hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    }
  }
  return (hash >>> 0).toString(16);
}

export async function putAttempt(attempt: Attempt): Promise<void> {
  await idbRequest(ATTEMPTS_STORE, "readwrite", (store) => store.put(attempt));
}

export async function deleteAttempt(id: string): Promise<void> {
  await idbRequest(ATTEMPTS_STORE, "readwrite", (store) => store.delete(id));
}

export async function listAttempts(songId: string): Promise<Attempt[]> {
  const all = await idbRequest<Attempt[]>(ATTEMPTS_STORE, "readonly", (store) =>
    store.index("songId").getAll(songId),
  );
  return all.toSorted((a, b) => b.at - a.at);
}

// ---- read-side derivation (never stored) ----

export interface DerivedSummary {
  hit: number; // notes landed within tolerance
  scored: number; // notes you actually voiced (silence you skipped doesn't count against you)
  total: number; // notes in the chart
  accuracy: number; // hit / scored, 0..1
}

// Accuracy of an attempt under a chosen tolerance, derived from the raw arrays. A
// note counts as hit if any sung sample within its span lands within tol.
export function deriveSummary(
  expected: readonly RefNote[],
  sung: readonly SungSample[],
  tolCents: number,
  anyOctave: boolean,
): DerivedSummary {
  let hit = 0;
  let scored = 0;
  for (const n of expected) {
    let voiced = false;
    let landed = false;
    for (const s of sung) {
      if (s.midi == null || s.t < n.t || s.t > n.t + n.dur) continue;
      voiced = true;
      if (centsBetween(s.midi, n.midi, anyOctave) <= tolCents) {
        landed = true;
        break;
      }
    }
    if (voiced) scored += 1;
    if (landed) hit += 1;
  }
  return { hit, scored, total: expected.length, accuracy: scored > 0 ? hit / scored : 0 };
}

// Per-expected-note outcome, index-aligned to the chart. `bestCents` is the signed
// deviation (+ sharp, − flat) at the closest approach; null if never voiced. This is
// the unit the comparison table diffs across attempts.
export interface NoteResult {
  voiced: boolean;
  hit: boolean;
  bestCents: number | null;
}

export function deriveNoteResults(
  expected: readonly RefNote[],
  sung: readonly SungSample[],
  tolCents: number,
  anyOctave: boolean,
): NoteResult[] {
  return expected.map((n) => {
    let best: number | null = null;
    for (const s of sung) {
      if (s.midi == null || s.t < n.t || s.t > n.t + n.dur) continue;
      const signed = signedCentsBetween(s.midi, n.midi, anyOctave);
      if (best === null || Math.abs(signed) < Math.abs(best)) best = signed;
    }
    return { voiced: best !== null, hit: best !== null && Math.abs(best) <= tolCents, bestCents: best };
  });
}

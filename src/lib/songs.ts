import type { RefNote } from "@/components/WarmupRoll";
import testChart from "@/data/warmup.json";

// A song to sing along to: the backing track (an instrumental stem) plus the
// vocal-melody chart derived from the vocal stem. The two-stem workflow is:
// run the source mp3 through stemdeck → get a vocal stem and an instrumental stem
// → transcribe the vocal stem to a note chart (Basic Pitch, offline for now) →
// drop the instrumental mp3 in public/ and the chart JSON in src/data/songs/.
//
// `audio` is a file in public/; `notes` is the melody line you sing and get scored
// against. Same {loMidi, hiMidi, notes} shape the warm-up already uses.
export interface Song {
  id: string;
  nameKey: string;
  audio: string;
  loMidi: number;
  hiMidi: number;
  notes: readonly RefNote[];
}

// Axis padding when a chart is a single pitch, so the roll isn't degenerate.
export const FALLBACK_SPAN = 4;

// Phase-1 stand-in: reuses the warm-up track's audio + its Basic-Pitch chart so
// the karaoke player is singable today with no new assets and no live ML. Real
// songs get their own instrumental stem + chart via the workflow above.
export const SONGS: readonly Song[] = [{ id: "test", nameKey: "songs.tracks.test", ...testChart }];

export function songById(id: string | undefined): Song {
  return SONGS.find((s) => s.id === id) ?? SONGS[0];
}

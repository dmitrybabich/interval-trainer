import type { RefNote } from "@/components/WarmupRoll";
import warmup1 from "@/data/warmup.json";
import warmup2 from "@/data/warmup2.json";

// A backing track you can sing along to: its audio file + the reference note line
// (MIDI, derived offline from the recording via Basic Pitch). `nameKey` points at
// an i18n string. Add a track by dropping its mp3 in public/, its notes JSON in
// src/data/, and one entry here.
export interface WarmupTrack {
  id: string;
  nameKey: string;
  audio: string;
  loMidi: number;
  hiMidi: number;
  notes: readonly RefNote[];
}

export const WARMUP_TRACKS: readonly WarmupTrack[] = [
  { id: "track-1", nameKey: "warmup.tracks.track1", ...warmup1 },
  { id: "track-2", nameKey: "warmup.tracks.track2", ...warmup2 },
];

export function trackById(id: string | undefined): WarmupTrack {
  return WARMUP_TRACKS.find((t) => t.id === id) ?? WARMUP_TRACKS[0];
}

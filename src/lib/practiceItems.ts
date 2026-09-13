import type { RefNote } from "@/components/WarmupRoll";
import type { SungSample } from "@/lib/attempts";
import { loadExercise, type PlayNote } from "@/lib/exercises";
import { buildMidiSong } from "@/lib/midiSong";
import { isMidiSongId } from "@/lib/midiSongs";
import { getMidiSong } from "@/lib/midiSongs";
import { getTrack } from "@/lib/practice";
import { notesToContour } from "@/lib/referenceContour";
import { getUserSong, isUserSongId } from "@/lib/userSongs";
import { WARMUP_TRACKS } from "@/lib/warmupTracks";

// Every practice item — built-in or uploaded — normalizes to the same shape: a
// backing to play over, and an optional reference melody. Reference present →
// scoring + target ribbon; absent → record-only. The id's prefix says where the
// bytes come from; nothing downstream cares whether it's built-in or uploaded.
//
// Prefixes: w: built-in warm-up · e: built-in exercise · t: uploaded media track ·
// u: uploaded audio song · m: uploaded MIDI song.
export type Backing =
  | { kind: "media"; mediaType: "audio" | "video"; url?: string; blob?: Blob }
  | { kind: "midi"; sound: readonly PlayNote[]; duration: number };

export interface ResolvedItem {
  id: string;
  name: string;
  backing: Backing;
  reference: readonly SungSample[] | null; // contour for scoring
  refNotes: readonly RefNote[] | null; // melody notes for the bar roll (note-based items)
  loMidi: number;
  hiMidi: number;
}

const FALLBACK_LO = 55;
const FALLBACK_HI = 67;

function rangeOf(notes: readonly RefNote[]): { loMidi: number; hiMidi: number } {
  const pitches = notes.map((n) => n.midi);
  const lo = pitches.length > 0 ? Math.min(...pitches) : FALLBACK_LO;
  const hi = pitches.length > 0 ? Math.max(...pitches) : FALLBACK_HI;
  return { loMidi: lo, hiMidi: hi === lo ? lo + 4 : hi };
}

async function resolveExercise(id: string): Promise<ResolvedItem | null> {
  const { EXERCISES, exerciseById } = await import("@/lib/exercises");
  const meta = EXERCISES.find((e) => e.id === id) ?? exerciseById(id);
  const parsed = await loadExercise(meta.url);
  return {
    id: `e:${meta.id}`,
    name: meta.id,
    backing: { kind: "midi", sound: parsed.sound, duration: parsed.duration },
    reference: notesToContour(parsed.melody),
    refNotes: parsed.melody,
    loMidi: parsed.loMidi,
    hiMidi: parsed.hiMidi,
  };
}

function resolveWarmup(id: string): ResolvedItem | null {
  const track = WARMUP_TRACKS.find((tr) => tr.id === id);
  if (!track) return null;
  return {
    id: `w:${track.id}`,
    name: track.id,
    backing: { kind: "media", mediaType: "audio", url: `${import.meta.env.BASE_URL}${track.audio}` },
    reference: notesToContour(track.notes),
    refNotes: track.notes,
    ...rangeOf(track.notes),
  };
}

/** Resolve any item id (built-in or uploaded) to a uniform playable item. */
export async function resolveItem(rawId: string): Promise<ResolvedItem | null> {
  const [prefix, ...rest] = rawId.split(":");
  const id = rest.join(":");
  if (prefix === "e") return resolveExercise(id);
  if (prefix === "w") return resolveWarmup(id);
  if (prefix === "t") {
    const track = await getTrack(rawId);
    if (!track) return null;
    return {
      id: rawId,
      name: track.name,
      backing: { kind: "media", mediaType: track.kind, blob: track.media },
      reference: null,
      refNotes: null,
      loMidi: FALLBACK_LO,
      hiMidi: FALLBACK_HI,
    };
  }
  if (isUserSongId(rawId)) {
    const song = await getUserSong(rawId);
    if (!song) return null;
    return {
      id: rawId,
      name: song.name,
      backing: { kind: "media", mediaType: "audio", blob: song.backing },
      reference: null,
      refNotes: null,
      loMidi: song.loMidi,
      hiMidi: song.hiMidi,
    };
  }
  if (isMidiSongId(rawId)) {
    const song = await getMidiSong(rawId);
    if (!song) return null;
    const built = buildMidiSong(await song.midi.arrayBuffer(), song.trackIndex);
    return {
      id: rawId,
      name: song.name,
      backing: { kind: "midi", sound: built.backing, duration: built.duration },
      reference: notesToContour(built.melody),
      refNotes: built.melody,
      loMidi: built.loMidi,
      hiMidi: built.hiMidi,
    };
  }
  return null;
}

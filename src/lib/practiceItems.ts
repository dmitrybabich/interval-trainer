import type { RefNote } from "@/components/WarmupRoll";
import { i18n } from "@/i18n";
import type { SungSample } from "@/lib/attempts";
import { loadExercise, type PlayNote } from "@/lib/exercises";
import { buildMidiSong, type MidiTrackInfo, parseMidiTracks } from "@/lib/midiSong";
import { getMidiSong, isMidiSongId } from "@/lib/midiSongs";
import { getTrack } from "@/lib/practice";
import { notesToContour } from "@/lib/referenceContour";
import { getUserSong, isUserSongId } from "@/lib/userSongs";

// Every practice item — built-in or uploaded — normalizes to the same shape: a
// backing to play over, and an optional reference melody. Reference present →
// scoring + target ribbon; absent → record-only. The id's prefix says where the
// bytes come from; nothing downstream cares whether it's built-in or uploaded.
//
// Prefixes: e: built-in exercise · t: uploaded media track · u: uploaded audio song ·
// m: uploaded MIDI song.
export type Backing =
  | { kind: "media"; mediaType: "audio" | "video"; url?: string; blob?: Blob }
  | { kind: "midi"; sound: readonly PlayNote[]; duration: number };

// Track picker state for a MIDI song — present only on uploaded MIDI items, so the
// player can show the play/melody selection panel.
export interface MidiTrackChoice {
  tracks: readonly MidiTrackInfo[];
  playTracks: readonly number[];
  melodyTrack: number | null;
}

export interface ResolvedItem {
  id: string;
  name: string;
  backing: Backing;
  reference: readonly SungSample[] | null; // contour for scoring
  refNotes: readonly RefNote[] | null; // melody notes for the bar roll (note-based items)
  midi?: MidiTrackChoice; // present for uploaded MIDI songs
  loMidi: number;
  hiMidi: number;
}

const FALLBACK_LO = 55;
const FALLBACK_HI = 67;

async function resolveExercise(id: string): Promise<ResolvedItem | null> {
  const { EXERCISES, exerciseById } = await import("@/lib/exercises");
  const meta = EXERCISES.find((e) => e.id === id) ?? exerciseById(id);
  const parsed = await loadExercise(meta.url);
  return {
    id: `e:${meta.id}`,
    name: i18n.t(meta.nameKey),
    backing: { kind: "midi", sound: parsed.sound, duration: parsed.duration },
    reference: notesToContour(parsed.melody),
    refNotes: parsed.melody,
    loMidi: parsed.loMidi,
    hiMidi: parsed.hiMidi,
  };
}

/** Resolve any item id (built-in or uploaded) to a uniform playable item. */
export async function resolveItem(rawId: string): Promise<ResolvedItem | null> {
  const [prefix, ...rest] = rawId.split(":");
  const id = rest.join(":");
  if (prefix === "e") return resolveExercise(id);
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
    const bytes = await song.midi.arrayBuffer();
    const sel = { playTracks: song.playTracks, melodyTrack: song.melodyTrack };
    const built = buildMidiSong(bytes, sel);
    const scored = song.melodyTrack != null;
    return {
      id: rawId,
      name: song.name,
      backing: { kind: "midi", sound: built.backing, duration: built.duration },
      reference: scored ? notesToContour(built.melody) : null,
      refNotes: scored ? built.melody : null,
      midi: { tracks: parseMidiTracks(bytes).tracks, playTracks: song.playTracks, melodyTrack: song.melodyTrack },
      loMidi: built.loMidi,
      hiMidi: built.hiMidi,
    };
  }
  return null;
}

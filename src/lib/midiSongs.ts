import { idbRequest, MIDI_SONGS_STORE } from "@/lib/db";

// A song the user added from a MIDI file: the raw MIDI bytes plus the track selection
// (which tracks sound, which one is scored as the melody). Parsed on load. `id` is
// prefixed so it never collides with built-in or audio-song ids.
export interface MidiSongMeta {
  id: string;
  name: string;
  playTracks: number[]; // track indices to sound
  melodyTrack: number | null; // scored/shown melody track, or null for none
  createdAt: number;
}

export interface MidiSongRecord extends MidiSongMeta {
  midi: Blob;
}

// Older records stored a single `trackIndex`; read them as "play that track, score
// that track" so they keep working after the multi-track change.
type LegacyRecord = Partial<MidiSongRecord> & { trackIndex?: number };
function normalize<T extends LegacyRecord>(rec: T): T & { playTracks: number[]; melodyTrack: number | null } {
  const playTracks = rec.playTracks ?? (rec.trackIndex == null ? [] : [rec.trackIndex]);
  const melodyTrack = rec.melodyTrack ?? rec.trackIndex ?? null;
  return { ...rec, playTracks, melodyTrack };
}

export const MIDI_SONG_PREFIX = "m:";

export function newMidiSongId(): string {
  return `${MIDI_SONG_PREFIX}${crypto.randomUUID()}`;
}

export function isMidiSongId(id: string): boolean {
  return id.startsWith(MIDI_SONG_PREFIX);
}

export async function putMidiSong(record: MidiSongRecord): Promise<void> {
  await idbRequest(MIDI_SONGS_STORE, "readwrite", (store) => store.put(record));
}

export async function getMidiSong(id: string): Promise<MidiSongRecord | undefined> {
  const rec = await idbRequest<MidiSongRecord | undefined>(MIDI_SONGS_STORE, "readonly", (store) => store.get(id));
  return rec ? normalize(rec) : undefined;
}

export async function deleteMidiSong(id: string): Promise<void> {
  await idbRequest(MIDI_SONGS_STORE, "readwrite", (store) => store.delete(id));
}

export async function renameMidiSong(id: string, name: string): Promise<void> {
  const rec = await getMidiSong(id);
  if (rec) await putMidiSong({ ...rec, name });
}

export async function setMidiSelection(id: string, playTracks: number[], melodyTrack: number | null): Promise<void> {
  const rec = await getMidiSong(id);
  if (rec) await putMidiSong({ ...rec, playTracks, melodyTrack });
}

export async function listMidiSongs(): Promise<MidiSongMeta[]> {
  const all = await idbRequest<MidiSongRecord[]>(MIDI_SONGS_STORE, "readonly", (store) => store.getAll());
  return all
    .map((rec) => {
      const { id, name, playTracks, melodyTrack, createdAt } = normalize(rec);
      return { id, name, playTracks, melodyTrack, createdAt };
    })
    .toSorted((a, b) => b.createdAt - a.createdAt);
}

import { idbRequest, MIDI_SONGS_STORE } from "@/lib/db";

// A song the user added from a MIDI file: the raw MIDI bytes plus which track is the
// melody to score against. Parsed on load. `id` is prefixed so it never collides
// with built-in or audio-song ids.
export interface MidiSongMeta {
  id: string;
  name: string;
  trackIndex: number;
  createdAt: number;
}

export interface MidiSongRecord extends MidiSongMeta {
  midi: Blob;
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
  return idbRequest<MidiSongRecord | undefined>(MIDI_SONGS_STORE, "readonly", (store) => store.get(id));
}

export async function deleteMidiSong(id: string): Promise<void> {
  await idbRequest(MIDI_SONGS_STORE, "readwrite", (store) => store.delete(id));
}

export async function renameMidiSong(id: string, name: string): Promise<void> {
  const rec = await getMidiSong(id);
  if (rec) await putMidiSong({ ...rec, name });
}

export async function listMidiSongs(): Promise<MidiSongMeta[]> {
  const all = await idbRequest<MidiSongRecord[]>(MIDI_SONGS_STORE, "readonly", (store) => store.getAll());
  return all
    .map(({ id, name, trackIndex, createdAt }) => ({ id, name, trackIndex, createdAt }))
    .toSorted((a, b) => b.createdAt - a.createdAt);
}

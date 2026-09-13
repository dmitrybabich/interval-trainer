import type { RefNote } from "@/components/WarmupRoll";
import type { SungSample } from "@/lib/attempts";
import { idbRequest, SONGS_STORE } from "@/lib/db";

// A song the user built from their own stems: the backing (instrumental) audio as
// a stored Blob, plus the vocal-derived melody chart. Lives in IndexedDB — audio
// blobs are far too big for localStorage. `id` is prefixed so it never collides
// with a built-in song id.
export interface UserSongMeta {
  id: string;
  name: string;
  loMidi: number;
  hiMidi: number;
  createdAt: number;
}

export interface UserSongRecord extends UserSongMeta {
  backing: Blob;
  notes: readonly RefNote[];
  // Continuous reference pitch curve (Stage 1). Optional while the note-based path
  // still exists; becomes the scoring reference once rendering/scoring switch over.
  reference?: readonly SungSample[];
}

export const USER_SONG_PREFIX = "u:";

export function newUserSongId(): string {
  return `${USER_SONG_PREFIX}${crypto.randomUUID()}`;
}

export function isUserSongId(id: string): boolean {
  return id.startsWith(USER_SONG_PREFIX);
}

export async function putUserSong(record: UserSongRecord): Promise<void> {
  await idbRequest(SONGS_STORE, "readwrite", (store) => store.put(record));
}

export async function getUserSong(id: string): Promise<UserSongRecord | undefined> {
  return idbRequest<UserSongRecord | undefined>(SONGS_STORE, "readonly", (store) => store.get(id));
}

export async function deleteUserSong(id: string): Promise<void> {
  await idbRequest(SONGS_STORE, "readwrite", (store) => store.delete(id));
}

// List metadata only — the backing blob and full note array stay on disk until a
// song is actually opened.
export async function listUserSongs(): Promise<UserSongMeta[]> {
  const all = await idbRequest<UserSongRecord[]>(SONGS_STORE, "readonly", (store) => store.getAll());
  return all
    .map(({ id, name, loMidi, hiMidi, createdAt }) => ({ id, name, loMidi, hiMidi, createdAt }))
    .toSorted((a, b) => b.createdAt - a.createdAt);
}

// Shared IndexedDB for the app's local data: uploaded songs and singing attempts.
// One module owns the DB name + version + schema so the stores are created together
// and versions never clash across features.

const DB_NAME = "interval-trainer";
const DB_VERSION = 4;
export const SONGS_STORE = "songs";
export const ATTEMPTS_STORE = "attempts";
export const MIDI_SONGS_STORE = "midiSongs";
export const PRACTICE_TRACKS_STORE = "practiceTracks";
export const PRACTICE_TAKES_STORE = "practiceTakes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SONGS_STORE)) db.createObjectStore(SONGS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(ATTEMPTS_STORE)) {
        const attempts = db.createObjectStore(ATTEMPTS_STORE, { keyPath: "id" });
        attempts.createIndex("songId", "songId", { unique: false });
      }
      if (!db.objectStoreNames.contains(MIDI_SONGS_STORE)) db.createObjectStore(MIDI_SONGS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PRACTICE_TRACKS_STORE)) {
        db.createObjectStore(PRACTICE_TRACKS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PRACTICE_TAKES_STORE)) {
        const takes = db.createObjectStore(PRACTICE_TAKES_STORE, { keyPath: "id" });
        takes.createIndex("trackId", "trackId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

// Run one request against a store and resolve its result.
export async function idbRequest<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const request = run(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

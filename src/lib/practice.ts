import { idbRequest, PRACTICE_TAKES_STORE, PRACTICE_TRACKS_STORE } from "@/lib/db";

// A backing track to practice over — an uploaded audio or video (e.g. webm) file.
export interface PracticeTrackMeta {
  id: string;
  name: string;
  kind: "audio" | "video";
  mime: string;
  createdAt: number;
}
export interface PracticeTrack extends PracticeTrackMeta {
  media: Blob;
}

// One recorded take (your voice) over a track.
export interface PracticeTakeMeta {
  id: string;
  trackId: string;
  name: string;
  durationS: number;
  createdAt: number;
}
export interface PracticeTake extends PracticeTakeMeta {
  audio: Blob;
}

export function newTrackId(): string {
  return `t:${crypto.randomUUID()}`;
}
export function newTakeId(): string {
  return `k:${crypto.randomUUID()}`;
}

// ---- tracks ----

export async function putTrack(track: PracticeTrack): Promise<void> {
  await idbRequest(PRACTICE_TRACKS_STORE, "readwrite", (store) => store.put(track));
}
export async function getTrack(id: string): Promise<PracticeTrack | undefined> {
  return idbRequest<PracticeTrack | undefined>(PRACTICE_TRACKS_STORE, "readonly", (store) => store.get(id));
}
export async function deleteTrack(id: string): Promise<void> {
  await idbRequest(PRACTICE_TRACKS_STORE, "readwrite", (store) => store.delete(id));
}
export async function renameTrack(id: string, name: string): Promise<void> {
  const rec = await getTrack(id);
  if (rec) await putTrack({ ...rec, name });
}
export async function listTracks(): Promise<PracticeTrackMeta[]> {
  const all = await idbRequest<PracticeTrack[]>(PRACTICE_TRACKS_STORE, "readonly", (store) => store.getAll());
  return all
    .map(({ id, name, kind, mime, createdAt }) => ({ id, name, kind, mime, createdAt }))
    .toSorted((a, b) => b.createdAt - a.createdAt);
}

// ---- takes ----

export async function putTake(take: PracticeTake): Promise<void> {
  await idbRequest(PRACTICE_TAKES_STORE, "readwrite", (store) => store.put(take));
}
export async function getTake(id: string): Promise<PracticeTake | undefined> {
  return idbRequest<PracticeTake | undefined>(PRACTICE_TAKES_STORE, "readonly", (store) => store.get(id));
}
export async function deleteTake(id: string): Promise<void> {
  await idbRequest(PRACTICE_TAKES_STORE, "readwrite", (store) => store.delete(id));
}
export async function listTakes(trackId: string): Promise<PracticeTake[]> {
  const all = await idbRequest<PracticeTake[]>(PRACTICE_TAKES_STORE, "readonly", (store) =>
    store.index("trackId").getAll(trackId),
  );
  return all.toSorted((a, b) => b.createdAt - a.createdAt);
}

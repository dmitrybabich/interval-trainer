import { useCallback, useEffect, useState } from "react";

import {
  deleteTake,
  deleteTrack,
  listTakes,
  listTracks,
  newTakeId,
  newTrackId,
  type PracticeTake,
  type PracticeTakeMeta,
  type PracticeTrackMeta,
  putTake,
  putTrack,
} from "@/lib/practice";

// The library of backing tracks.
export function usePracticeTracks(): {
  tracks: readonly PracticeTrackMeta[];
  add: (file: File) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
} {
  const [tracks, setTracks] = useState<readonly PracticeTrackMeta[]>([]);
  const refresh = useCallback(() => {
    void listTracks()
      .then(setTracks)
      .catch(() => setTracks([]));
  }, []);
  useEffect(refresh, [refresh]);

  const add = useCallback(
    async (file: File): Promise<string | null> => {
      const id = newTrackId();
      const kind = file.type.startsWith("video") ? "video" : "audio";
      await putTrack({ id, name: file.name.replace(/\.[^.]+$/, ""), kind, mime: file.type, media: file, createdAt: Date.now() });
      refresh();
      return id;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteTrack(id);
      const takes = await listTakes(id);
      await Promise.all(takes.map((tk) => deleteTake(tk.id)));
      refresh();
    },
    [refresh],
  );

  return { tracks, add, remove };
}

// The takes recorded over one track (full records, so the screen can play them).
export function usePracticeTakes(trackId: string | undefined): {
  takes: readonly PracticeTake[];
  add: (audio: Blob, durationS: number, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const [takes, setTakes] = useState<readonly PracticeTake[]>([]);
  const refresh = useCallback(() => {
    if (!trackId) {
      setTakes([]);
      return;
    }
    void listTakes(trackId)
      .then(setTakes)
      .catch(() => setTakes([]));
  }, [trackId]);
  useEffect(refresh, [refresh]);

  const add = useCallback(
    async (audio: Blob, durationS: number, name: string): Promise<void> => {
      if (!trackId) return;
      await putTake({ id: newTakeId(), trackId, name, durationS, audio, createdAt: Date.now() });
      refresh();
    },
    [trackId, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteTake(id);
      refresh();
    },
    [refresh],
  );

  return { takes, add, remove };
}

export type { PracticeTakeMeta };

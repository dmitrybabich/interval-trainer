import { useCallback, useEffect, useState } from "react";

import {
  deleteMidiSong,
  listMidiSongs,
  type MidiSongMeta,
  newMidiSongId,
  putMidiSong,
} from "@/lib/midiSongs";

export interface UseMidiSongs {
  songs: readonly MidiSongMeta[];
  add: (name: string, file: File, trackIndex: number) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
}

// The user's uploaded MIDI songs. The file's bytes + chosen melody-track index are
// stored; parsing to playable notes happens on load. List survives reloads.
export function useMidiSongs(): UseMidiSongs {
  const [songs, setSongs] = useState<readonly MidiSongMeta[]>([]);

  const refresh = useCallback(() => {
    void listMidiSongs()
      .then(setSongs)
      .catch(() => setSongs([]));
  }, []);

  useEffect(refresh, [refresh]);

  const add = useCallback(
    async (name: string, file: File, trackIndex: number): Promise<string | null> => {
      try {
        const id = newMidiSongId();
        await putMidiSong({ id, name: name.trim() || "Untitled", midi: file, trackIndex, createdAt: Date.now() });
        refresh();
        return id;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteMidiSong(id);
      refresh();
    },
    [refresh],
  );

  return { songs, add, remove };
}

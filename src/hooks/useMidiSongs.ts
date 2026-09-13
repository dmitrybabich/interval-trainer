import { useCallback, useEffect, useState } from "react";

import { parseMidiTracks } from "@/lib/midiSong";
import {
  deleteMidiSong,
  listMidiSongs,
  type MidiSongMeta,
  newMidiSongId,
  putMidiSong,
  renameMidiSong,
  setMidiSelection,
} from "@/lib/midiSongs";

export interface UseMidiSongs {
  songs: readonly MidiSongMeta[];
  add: (name: string, file: File) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  setSelection: (id: string, playTracks: number[], melodyTrack: number | null) => Promise<void>;
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
    async (name: string, file: File): Promise<string | null> => {
      try {
        const id = newMidiSongId();
        // Import the whole file: play every note-bearing track, score the first.
        const { tracks } = parseMidiTracks(await file.arrayBuffer());
        const playTracks = tracks.map((tr) => tr.index);
        await putMidiSong({
          id,
          name: name.trim() || "Untitled",
          midi: file,
          playTracks,
          melodyTrack: playTracks[0] ?? null,
          createdAt: Date.now(),
        });
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

  const rename = useCallback(
    async (id: string, name: string): Promise<void> => {
      await renameMidiSong(id, name.trim() || "Untitled");
      refresh();
    },
    [refresh],
  );

  const setSelection = useCallback(
    async (id: string, playTracks: number[], melodyTrack: number | null): Promise<void> => {
      await setMidiSelection(id, playTracks, melodyTrack);
      refresh();
    },
    [refresh],
  );

  return { songs, add, remove, rename, setSelection };
}

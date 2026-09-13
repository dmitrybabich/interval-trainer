import { Midi } from "@tonejs/midi";

import type { RefNote } from "@/components/WarmupRoll";
import type { PlayNote } from "@/lib/exercises";
import { midiToName } from "@/lib/music";

const MELODY_GAIN = 1;
const BACKING_GAIN = 0.55;
const FALLBACK_SPAN = 4;

export interface MidiTrackInfo {
  index: number;
  label: string; // human label for the picker
  noteCount: number;
  loMidi: number;
  hiMidi: number;
}

export interface MidiTracks {
  tracks: MidiTrackInfo[];
  duration: number;
}

// A track label a human can pick from. MIDI track names are often mojibake (bad
// encoding), so fall back to an index + range when the name isn't clean ASCII.
function trackLabel(index: number, name: string, lo: number, hi: number): string {
  const clean = name.trim();
  const readable = clean.length > 0 && !/[^\x20-\x7E]/.test(clean);
  const base = readable ? clean : `Track ${index + 1}`;
  return `${base} · ${midiToName(lo)}–${midiToName(hi)}`;
}

// List the note-bearing tracks in a MIDI file for the track picker.
export function parseMidiTracks(bytes: ArrayBuffer): MidiTracks {
  const midi = new Midi(bytes);
  const tracks: MidiTrackInfo[] = [];
  midi.tracks.forEach((tr, index) => {
    if (tr.notes.length === 0) return;
    const pitches = tr.notes.map((n) => n.midi);
    const lo = Math.min(...pitches);
    const hi = Math.max(...pitches);
    tracks.push({ index, label: trackLabel(index, tr.name, lo, hi), noteCount: tr.notes.length, loMidi: lo, hiMidi: hi });
  });
  return { tracks, duration: midi.duration };
}

export interface MidiSongData {
  melody: readonly RefNote[]; // the chosen track — reference for scoring/ribbon
  backing: readonly PlayNote[]; // every track, played through the piano
  loMidi: number;
  hiMidi: number;
  duration: number;
}

// Build playable data for a MIDI song: the chosen track is the melody (louder in the
// mix and the scoring reference); all tracks play as the backing arrangement.
export function buildMidiSong(bytes: ArrayBuffer, trackIndex: number): MidiSongData {
  const midi = new Midi(bytes);
  const melody: RefNote[] = [];
  const backing: PlayNote[] = [];
  midi.tracks.forEach((tr, index) => {
    const isMelody = index === trackIndex;
    for (const n of tr.notes) {
      const note: RefNote = { t: n.time, midi: n.midi, dur: n.duration };
      if (isMelody) melody.push(note);
      backing.push({ ...note, gain: isMelody ? MELODY_GAIN : BACKING_GAIN });
    }
  });
  const pitches = melody.map((n) => n.midi);
  const lo = pitches.length > 0 ? Math.min(...pitches) : 60;
  const hi = pitches.length > 0 ? Math.max(...pitches) : 72;
  return {
    melody: melody.toSorted((a, b) => a.t - b.t),
    backing: backing.toSorted((a, b) => a.t - b.t),
    loMidi: lo,
    hiMidi: hi === lo ? lo + FALLBACK_SPAN : hi,
    duration: midi.duration,
  };
}

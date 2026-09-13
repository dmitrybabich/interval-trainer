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

export interface MidiSelection {
  playTracks: readonly number[]; // track indices to sound through the piano
  melodyTrack: number | null; // track scored/shown as the melody, or null for none
}

export interface MidiSongData {
  melody: readonly RefNote[]; // the scoring/ribbon track (empty when melodyTrack is null)
  backing: readonly PlayNote[]; // the selected tracks, played through the piano
  loMidi: number;
  hiMidi: number;
  duration: number;
}

// Build playable data for a MIDI song from the track selection: the played tracks
// form the backing arrangement (the melody track louder), and the melody track is the
// scoring/ribbon reference.
export function buildMidiSong(bytes: ArrayBuffer, sel: MidiSelection): MidiSongData {
  const midi = new Midi(bytes);
  const played = new Set(sel.playTracks);
  const melody: RefNote[] = [];
  const backing: PlayNote[] = [];
  midi.tracks.forEach((tr, index) => {
    const isMelody = index === sel.melodyTrack;
    for (const n of tr.notes) {
      const note: RefNote = { t: n.time, midi: n.midi, dur: n.duration };
      if (isMelody) melody.push(note);
      if (played.has(index)) backing.push({ ...note, gain: isMelody ? MELODY_GAIN : BACKING_GAIN });
    }
  });
  const pitches = (melody.length > 0 ? melody : backing).map((n) => n.midi);
  const lo = pitches.length > 0 ? Math.min(...pitches) : 60;
  const hi = pitches.length > 0 ? Math.max(...pitches) : 72;
  // midi.duration can be 0 for some files (it comes from the header, not the notes),
  // which makes the transport think it ended at t=0. Fall back to the last note-off.
  const notesEnd = backing.reduce((max, n) => Math.max(max, n.t + n.dur), 0);
  return {
    melody: melody.toSorted((a, b) => a.t - b.t),
    backing: backing.toSorted((a, b) => a.t - b.t),
    loMidi: lo,
    hiMidi: hi === lo ? lo + FALLBACK_SPAN : hi,
    duration: Math.max(midi.duration || 0, notesEnd),
  };
}

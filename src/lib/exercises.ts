import { Midi } from "@tonejs/midi";

import type { RefNote } from "@/components/WarmupRoll";
import e1 from "@/data/exercises/e1.midi?url";
import e2 from "@/data/exercises/e2.midi?url";
import e3 from "@/data/exercises/e3.midi?url";
import e4 from "@/data/exercises/e4.midi?url";
import e5 from "@/data/exercises/e5.midi?url";
import e6 from "@/data/exercises/e6.midi?url";
import e7 from "@/data/exercises/e7.midi?url";
import e8 from "@/data/exercises/e8.midi?url";

// A vocal exercise backed by a MIDI file. The MIDI is the single source of truth:
// channel 0 is the melody line you sing (and get scored against), channel 1 is the
// «минус» accompaniment. `nameKey` points at an i18n string; `url` is the bundled
// asset we fetch and parse in the browser.
export interface ExerciseMeta {
  id: string;
  nameKey: string;
  url: string;
}

export const EXERCISES: readonly ExerciseMeta[] = [
  { id: "e1", nameKey: "exercises.tracks.e1", url: e1 },
  { id: "e2", nameKey: "exercises.tracks.e2", url: e2 },
  { id: "e3", nameKey: "exercises.tracks.e3", url: e3 },
  { id: "e4", nameKey: "exercises.tracks.e4", url: e4 },
  { id: "e5", nameKey: "exercises.tracks.e5", url: e5 },
  { id: "e6", nameKey: "exercises.tracks.e6", url: e6 },
  { id: "e7", nameKey: "exercises.tracks.e7", url: e7 },
  { id: "e8", nameKey: "exercises.tracks.e8", url: e8 },
];

export function exerciseById(id: string | undefined): ExerciseMeta {
  return EXERCISES.find((e) => e.id === id) ?? EXERCISES[0];
}

// A note we schedule on the piano. `gain` lets the sung melody lead over the
// quieter accompaniment.
export interface PlayNote extends RefNote {
  gain: number;
}

export interface ParsedExercise {
  melody: readonly RefNote[]; // the line you sing — drives the roll and scoring
  sound: readonly PlayNote[]; // everything that plays through the piano
  loMidi: number;
  hiMidi: number;
  duration: number;
}

const MELODY_GAIN = 1;
const BACKING_GAIN = 0.6;
const ACCOMPANIMENT_CHANNEL = 1;
// Fallback axis padding when a line is a single pitch, so the roll isn't degenerate.
const FALLBACK_SPAN = 4;

const cache = new Map<string, ParsedExercise>();

export async function loadExercise(url: string): Promise<ParsedExercise> {
  const cached = cache.get(url);
  if (cached) return cached;

  const buf = await (await fetch(url)).arrayBuffer();
  const midi = new Midi(buf);

  const melody: RefNote[] = [];
  const sound: PlayNote[] = [];
  for (const track of midi.tracks) {
    const isBacking = track.channel === ACCOMPANIMENT_CHANNEL;
    for (const n of track.notes) {
      const note: RefNote = { t: n.time, midi: n.midi, dur: n.duration };
      if (!isBacking) melody.push(note);
      sound.push({ ...note, gain: isBacking ? BACKING_GAIN : MELODY_GAIN });
    }
  }

  const pitches = (melody.length ? melody : sound).map((n) => n.midi);
  const lo = pitches.length ? Math.min(...pitches) : 60;
  const hi = pitches.length ? Math.max(...pitches) : 60;
  const parsed: ParsedExercise = {
    melody: melody.toSorted((a, b) => a.t - b.t),
    sound: sound.toSorted((a, b) => a.t - b.t),
    loMidi: lo,
    hiMidi: hi === lo ? lo + FALLBACK_SPAN : hi,
    duration: midi.duration,
  };
  cache.set(url, parsed);
  return parsed;
}

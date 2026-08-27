import { useCallback, useEffect, useRef, useState } from "react";

import { randInt } from "@/lib/music";
import { loadKeyOctave, loadPianoView, type PianoView, saveKeyOctave,savePianoView } from "@/lib/persistence";

// The piano's octave picker is independent of the singer's vocal range: a fixed
// C2–C5, so the same choices show on every device and setup.
export const PIANO_OCTAVES = [2, 3, 4, 5] as const;
const DEFAULT_OCTAVE = 4;

function octaveBaseMidi(octave: number): number {
  return (octave + 1) * 12; // MIDI of that octave's C
}

// Computer-key layout, keyed by semitone offset above the selected octave's C.
// Home row a s d f g h j = the naturals C..B; the row above w e t y u = the
// sharps; k l ; spill into the next octave's C D E. Single source of truth for
// both the on-key labels and the physical-keyboard handler, so "a" is always the
// selected octave's C, whichever octave that is.
export const KEY_BY_OFFSET: Record<number, string> = {
  0: "a",
  1: "w",
  2: "s",
  3: "e",
  4: "d",
  5: "f",
  6: "t",
  7: "g",
  8: "y",
  9: "h",
  10: "u",
  11: "j",
  12: "k",
  14: "l",
  16: ";",
};
const OFFSET_BY_KEY: Record<string, number> = Object.fromEntries(
  Object.entries(KEY_BY_OFFSET).map(([offset, letter]) => [letter, Number(offset)]),
);

// The physical-keyboard handler. Note letters play their key. Arrows and the
// other single-key actions: →/← step to the next/previous semitone within the
// selected octave, ↑ replays the last note (same as Space), ↓ plays a random
// note (same as "/"). Ignored while a form control is focused; key-repeat is
// suppressed so holding a key doesn't machine-gun the note (arrows excepted, so
// you can hold to walk up/down the octave).
function usePianoKeyboard(handlers: {
  midiForKey: (key: string) => number | null;
  press: (midi: number) => void;
  playRandom: () => void;
  replayLast: () => void;
  stepNote: (delta: number) => void;
}): void {
  const { midiForKey, press, playRandom, replayLast, stepNote } = handlers;
  const held = useRef(new Set<string>());
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;

      switch (e.key) {
        case "/":
        case "ArrowDown":
          e.preventDefault();
          if (!e.repeat) playRandom();
          return;
        case "ArrowUp":
          e.preventDefault();
          if (!e.repeat) replayLast();
          return;
        case "ArrowRight":
          e.preventDefault();
          stepNote(1);
          return;
        case "ArrowLeft":
          e.preventDefault();
          stepNote(-1);
          return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) replayLast();
        return;
      }
      if (e.repeat) return;
      const midi = midiForKey(e.key.toLowerCase());
      if (midi == null || held.current.has(e.key)) return;
      held.current.add(e.key);
      e.preventDefault();
      press(midi);
    };
    const onUp = (e: KeyboardEvent) => held.current.delete(e.key);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [midiForKey, press, playRandom, replayLast, stepNote]);
}

// Note actions bound to the selected octave's C (`base`): the flash-on-play set,
// play, random-in-octave, replay-last, step-by-semitone, and letter→MIDI mapping.
// `press` remembers the last note so replay/step have an anchor.
function useNoteActions(base: number, onPlay: (midi: number) => void) {
  const [active, setActive] = useState<ReadonlySet<number>>(() => new Set());
  const lastPlayed = useRef<number | null>(null);

  const flash = useCallback((midi: number) => {
    setActive((cur) => new Set(cur).add(midi));
    window.setTimeout(() => {
      setActive((cur) => {
        const next = new Set(cur);
        next.delete(midi);
        return next;
      });
    }, 140);
  }, []);

  const press = useCallback(
    (midi: number) => {
      lastPlayed.current = midi;
      onPlay(midi);
      flash(midi);
    },
    [onPlay, flash],
  );

  const playRandom = useCallback(() => press(randInt(base, base + 11)), [base, press]);
  const replayLast = useCallback(() => {
    if (lastPlayed.current != null) press(lastPlayed.current);
  }, [press]);

  // Step ±1 semitone from the last note, staying inside the octave (C..B). With
  // nothing played yet, the first step lands on C so arrow-walking has a start.
  const stepNote = useCallback(
    (delta: number) => {
      const from = lastPlayed.current ?? base - delta;
      press(Math.min(base + 11, Math.max(base, from + delta)));
    },
    [base, press],
  );

  const midiForKey = useCallback(
    (key: string): number | null => {
      const offset = OFFSET_BY_KEY[key];
      return offset === undefined ? null : base + offset;
    },
    [base],
  );

  return { active, press, playRandom, replayLast, stepNote, midiForKey };
}

// The sustained-tonic drone: sings the selected octave's C (`base`) while on,
// retuning when the octave changes and stopping on unmount. Ephemeral (not
// persisted) so a page load never blasts a tone unbidden.
function useDrone(base: number, onDrone: (midi: number | null) => void) {
  const [droneOn, setDroneOn] = useState(false);
  const toggleDrone = useCallback(() => setDroneOn((v) => !v), []);
  const droneMidi = droneOn ? base : null;
  useEffect(() => {
    onDrone(droneMidi);
    return () => onDrone(null);
  }, [droneMidi, onDrone]);
  return { droneMidi, droneOn, toggleDrone };
}

export interface Piano {
  keyOctave: number;
  setKeyOctave: (octave: number) => void;
  view: PianoView;
  setView: (view: PianoView) => void;
  // The MIDI span the keyboard renders: one octave, or the full vocal range.
  loMidi: number;
  hiMidi: number;
  active: ReadonlySet<number>;
  press: (midi: number) => void;
  playRandom: () => void;
  replayLast: () => void;
  // The sustained-tonic drone: its pitch when on (the selected octave's C), else
  // null. Toggle flips it.
  droneMidi: number | null;
  droneOn: boolean;
  toggleDrone: () => void;
}

/**
 * Shared state + actions for the detector's piano. The octave picker is a fixed
 * C2–C5, independent of the singer's vocal range; the view toggle switches
 * between showing just that octave or the full range, and the shortcuts always
 * bind to the selected octave. Lives here (not in the keyboard component)
 * because the floating quick-keys over the graph drive the same actions, and it
 * owns the physical-keyboard handler: note letters, "/" random, Space replay.
 */
export function usePiano({
  rangeLo,
  rangeHi,
  onPlay,
  onDrone,
}: {
  rangeLo: number;
  rangeHi: number;
  onPlay: (midi: number) => void;
  onDrone: (midi: number | null) => void;
}): Piano {
  const [keyOctave, setKeyOctaveState] = useState(() => loadKeyOctave() ?? DEFAULT_OCTAVE);
  const setKeyOctave = useCallback((octave: number) => {
    setKeyOctaveState(octave);
    saveKeyOctave(octave);
  }, []);

  const [view, setViewState] = useState<PianoView>(() => loadPianoView() ?? "octave");
  const setView = useCallback((next: PianoView) => {
    setViewState(next);
    savePianoView(next);
  }, []);

  const base = octaveBaseMidi(keyOctave);
  // The visible keyboard: one octave (C..C, 13 keys) or the whole vocal range.
  const [loMidi, hiMidi] = view === "range" ? [rangeLo, rangeHi] : [base, base + 12];

  const { active, press, playRandom, replayLast, stepNote, midiForKey } = useNoteActions(base, onPlay);
  usePianoKeyboard({ midiForKey, press, playRandom, replayLast, stepNote });
  const { droneMidi, droneOn, toggleDrone } = useDrone(base, onDrone);

  return {
    keyOctave,
    setKeyOctave,
    view,
    setView,
    loMidi,
    hiMidi,
    active,
    press,
    playRandom,
    replayLast,
    droneMidi,
    droneOn,
    toggleDrone,
  };
}

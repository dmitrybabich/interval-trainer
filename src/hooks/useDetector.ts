import { useCallback, useEffect, useRef, useState } from "react";

import { AudioEngine } from "@/audio/AudioEngine";

// One frame of sung pitch, stamped against the AudioContext clock. Unlike the
// warm-up there's no backing track, so the clock is just engine.now() — a
// monotonic seconds counter that drives the scrolling roll.
export interface PitchPoint {
  t: number;
  midi: number | null; // fractional MIDI, null when not singing
}

// A stretch of time you held one note. Committed once you leave it; the live one
// (still in progress) is drawn separately so the bar grows as you sustain.
export interface Dwell {
  note: number; // the semitone you settled on (rounded MIDI)
  centerMidi: number; // mean sung pitch across the hold, for exact placement
  startT: number;
  endT: number;
}

// A piano key you played: drops a horizontal guide line on the roll at that
// pitch so you can sing to meet it. Fades over REF_FADE_S like a ringing note.
export interface KeyRef {
  midi: number;
  startT: number;
}

// Ring buffer for the sung trail — enough to fill the visible window plus slack.
const TRAIL_CAP = 1200;
// A hold must last this long to register as a note you "stayed on".
const DWELL_MIN_S = 0.22;
// Brief dropouts (detector flicker, a quick breath) shorter than this don't break
// a hold — keeps one sustained note from shattering into a dozen tiny bars.
const GAP_S = 0.12;
// Dwells linger this long after they end, fading out — the "disappears over time"
// memory of your melody. Older than this and they're pruned.
const FADE_S = 10;
// A played piano key's guide line lingers this long before fading out.
const REF_FADE_S = 8;

interface LiveHold {
  note: number;
  startT: number;
  lastT: number; // last frame this note was still being sung
  sum: number; // running sum of sung MIDI, for the mean
  n: number;
}

export interface DetectorUi {
  ready: boolean;
}

// A hold only earns a dwell once it's lasted DWELL_MIN_S — brushing past a note
// doesn't count as staying on it.
function commitHold(h: LiveHold, into: Dwell[]): void {
  if (h.lastT - h.startT < DWELL_MIN_S) return;
  into.push({ note: h.note, centerMidi: h.sum / h.n, startT: h.startT, endT: h.lastT });
}

// Fold one frame's sung pitch into the running hold: extend it if you're still on
// the same semitone, otherwise commit the old hold and open a new one. A silent
// frame only closes the hold once the gap exceeds GAP_S, so brief dropouts don't
// shatter a sustained note. Returns the hold to carry into the next frame.
function foldPitch(midi: number | null, now: number, cur: LiveHold | null, dwells: Dwell[]): LiveHold | null {
  if (midi != null) {
    const note = Math.round(midi);
    if (cur?.note === note) {
      cur.lastT = now;
      cur.sum += midi;
      cur.n += 1;
      return cur;
    }
    if (cur) commitHold(cur, dwells);
    return { note, startT: now, lastT: now, sum: midi, n: 1 };
  }
  if (cur && now - cur.lastT > GAP_S) {
    commitHold(cur, dwells);
    return null;
  }
  return cur;
}

interface Buffers {
  trail: PitchPoint[];
  dwells: Dwell[];
  refs: KeyRef[];
  hold: LiveHold | null;
}

// One rAF frame of work: sample the pitch, extend the trail + hold, and prune
// anything that's faded past its window. Mutates the buffers in place; the hook
// just owns them and fires the frame callbacks after.
function stepDetector(engine: AudioEngine, buf: Buffers): void {
  const now = engine.now();
  const s = engine.readPitch();
  buf.trail.push({ t: now, midi: s.singing ? s.midi : null });
  if (buf.trail.length > TRAIL_CAP) buf.trail.shift();

  buf.hold = foldPitch(s.singing ? s.midi : null, now, buf.hold, buf.dwells);
  if (buf.dwells.length > 0 && now - buf.dwells[0].endT > FADE_S) {
    buf.dwells = buf.dwells.filter((d) => now - d.endT <= FADE_S);
  }
  if (buf.refs.length > 0 && now - buf.refs[0].startT > REF_FADE_S) {
    buf.refs = buf.refs.filter((r) => now - r.startT <= REF_FADE_S);
  }
}

/**
 * Freeform real-time pitch detector: owns its AudioEngine + mic + rAF loop, no
 * track and no targets. Each frame it samples your pitch, appends it to the
 * scrolling trail, and folds sustained pitches into "dwells" — the notes you
 * held long enough to count. Dwells fade with age, so singing a melody leaves a
 * trail of the notes you actually settled on. The canvas reads all state through
 * refs; React state holds only the mic-ready flag.
 */
export function useDetector(): {
  ui: DetectorUi;
  trailRef: () => readonly PitchPoint[];
  dwellsRef: () => readonly Dwell[];
  liveRef: () => Dwell | null;
  refsRef: () => readonly KeyRef[];
  clockRef: () => number;
  onFrame: (cb: () => void) => () => void;
  start: (onDenied: (msg: string) => void) => Promise<boolean>;
  stop: () => void;
  clear: () => void;
  playKey: (midi: number) => void;
} {
  const engineRef = useRef<AudioEngine>(new AudioEngine());
  const rafId = useRef<number | null>(null);
  const buf = useRef<Buffers>({ trail: [], dwells: [], refs: [], hold: null });
  const frameCbs = useRef(new Set<() => void>());

  const [ui, setUi] = useState<DetectorUi>({ ready: false });

  const loop = useCallback(() => {
    stepDetector(engineRef.current, buf.current);
    frameCbs.current.forEach((cb) => cb());
    rafId.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(
    async (onDenied: (msg: string) => void): Promise<boolean> => {
      try {
        await engineRef.current.startMic(onDenied);
      } catch {
        return false;
      }
      setUi({ ready: true });
      rafId.current ??= requestAnimationFrame(loop);
      return true;
    },
    [loop],
  );

  // Sound a piano key and drop its guide line on the roll. The engine's
  // AudioContext comes up with the mic, so this is live once the page is ready.
  const playKey = useCallback((midi: number) => {
    engineRef.current.playKey(midi);
    buf.current.refs.push({ midi, startT: engineRef.current.now() });
  }, []);

  const clear = useCallback(() => {
    buf.current = { trail: [], dwells: [], refs: [], hold: null };
  }, []);

  const stop = useCallback(() => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    engineRef.current.dispose();
    clear();
    setUi({ ready: false });
  }, [clear]);

  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      engine.dispose();
    };
  }, []);

  const trailRef = useCallback((): readonly PitchPoint[] => buf.current.trail, []);
  const dwellsRef = useCallback((): readonly Dwell[] => buf.current.dwells, []);
  const liveRef = useCallback((): Dwell | null => {
    const h = buf.current.hold;
    if (!h || h.lastT - h.startT < DWELL_MIN_S) return null;
    return { note: h.note, centerMidi: h.sum / h.n, startT: h.startT, endT: h.lastT };
  }, []);
  const refsRef = useCallback((): readonly KeyRef[] => buf.current.refs, []);
  const clockRef = useCallback((): number => engineRef.current.now(), []);
  const onFrame = useCallback((cb: () => void) => {
    frameCbs.current.add(cb);
    return () => frameCbs.current.delete(cb);
  }, []);

  return { ui, trailRef, dwellsRef, liveRef, refsRef, clockRef, onFrame, start, stop, clear, playKey };
}

export const DETECTOR_FADE_S = FADE_S;
export const DETECTOR_REF_FADE_S = REF_FADE_S;

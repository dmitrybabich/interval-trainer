/* eslint-disable max-lines-per-function, sonarjs/cognitive-complexity, unicorn/no-lonely-if
   -- one cohesive hook; the pitch loop is inherently branchy and splitting it would fragment state. */
import { useCallback, useEffect, useRef, useState } from "react";

import { AudioEngine } from "@/audio/AudioEngine";
import {
  ANCHOR_HOLD_MS,
  DEFAULT_PREFS,
  PASS_MS,
  TOUCH_MS,
  TRAIL_LENGTH,
  WRONG_NOTE_HINT_MS,
} from "@/lib/constants";
import { LEVELS } from "@/lib/levels";
import { midiToFreq, midiToName, pick, randInt, rangeBounds } from "@/lib/music";
import { loadSavedRange, saveRange } from "@/lib/persistence";

export type CueState = "listen" | "sing" | "next";

export interface UiSnapshot {
  levelIdx: number;
  targets: readonly number[];
  idx: number;
  liveNote: string;
  liveCents: string;
  status: string;
  statusVariant: "" | "good" | "near";
  cue: CueState;
  sungMidi: number | null;
  covered: readonly number[];
  loMidi: number;
  hiMidi: number;
  tolCents: number;
  running: boolean;
  flashKey: number;
  direction: "up" | "down";
  mode: "guided" | "ear";
  hasDrone: boolean;
}

export interface TrainerActions {
  startLevel(levelIdx: number, config: TrainerConfig): Promise<void>;
  leaveTrainer(): void;
  buildExercise(): Promise<void>;
  replayAll(): void;
  playStartNote(): void;
  playHint(): void;
  skip(): void;
  toggleMode(): void;
  toggleDirection(): void;
  requestMic(onDenied: (msg: string) => void): Promise<boolean>;
  reloadRangeFromStorage(): void;
}

export interface TrainerConfig {
  tolCents: number;
  holdMs: number;
  mode: "guided" | "ear";
  direction: "up" | "down";
  guideTone: boolean;
  rangeFallback: { base: number; lo: number; hi: number };
}

// Non-reactive session state — mutated every rAF tick. Never triggers renders.
interface SessionRefs {
  levelIdx: number;
  tolCents: number;
  holdMs: number;
  mode: "guided" | "ear";
  direction: "up" | "down";
  guideTone: boolean;
  base: number;
  loMidi: number;
  hiMidi: number;
  targets: number[];
  idx: number;
  holding: number;
  lastTs: number;
  running: boolean;
  trail: (number | null)[];
  anchorHold: number;
  anchorArmed: boolean;
  wrongHold: number;
  covered: Set<number>;
  supportPlayed: boolean;
  droneTimer: number | null;
  nextTimer: number | null;
}

function initSession(): SessionRefs {
  return {
    levelIdx: 0,
    tolCents: 50,
    holdMs: 3000,
    mode: DEFAULT_PREFS.mode,
    direction: DEFAULT_PREFS.direction,
    guideTone: false,
    base: 55,
    loMidi: 48,
    hiMidi: 67,
    targets: [],
    idx: 0,
    holding: 0,
    lastTs: 0,
    running: false,
    trail: [],
    anchorHold: 0,
    anchorArmed: true,
    wrongHold: 0,
    covered: new Set(),
    supportPlayed: false,
    droneTimer: null,
    nextTimer: null,
  };
}

const CENTS_PER_SEMITONE = 100;
const MS_PER_S = 1000;
const HOLD_DECAY_RATE = 0.5;
const DRONE_START_DELAY_MS = 50;
const REPLAY_GAP_S = 0.8;
const REPLAY_DUR_S = 1.0;
const REPLAY_HEAD_MS = 150;
const REPLAY_TAIL_MS = 300;
const AUTO_REBUILD_PAD_MS = 500;

/**
 * Central hook: owns the AudioEngine, the pitch-detection rAF loop, and the
 * exercise state. Only the UI-facing subset of state is stored in React; the
 * per-frame session state lives in refs, drawn straight to the canvas.
 */
export function useTrainer(): {
  ui: UiSnapshot;
  bufTrail: () => readonly (number | null)[];
  actions: TrainerActions;
  onFrame: (cb: (dt: number) => void) => () => void;
  engine: AudioEngine;
} {
  const engineRef = useRef<AudioEngine>(new AudioEngine());
  const engine = engineRef.current;
  const S = useRef<SessionRefs>(initSession());
  const rafId = useRef<number | null>(null);
  const flashCounter = useRef(0);
  const frameSubs = useRef<Set<(dt: number) => void>>(new Set());

  const [ui, setUi] = useState<UiSnapshot>({
    levelIdx: 0,
    targets: [],
    idx: 0,
    liveNote: "—",
    liveCents: "",
    status: "Listen to the target, then sing it.",
    statusVariant: "",
    cue: "listen",
    sungMidi: null,
    covered: [],
    loMidi: 48,
    hiMidi: 67,
    tolCents: 50,
    running: false,
    flashKey: 0,
    direction: DEFAULT_PREFS.direction,
    mode: DEFAULT_PREFS.mode,
    hasDrone: false,
  });

  // Merge a partial into ui without stomping unchanged fields — used by
  // exercise/advance/setStatus/etc.
  const patchUi = useCallback((patch: Partial<UiSnapshot>) => {
    setUi((prev) => ({ ...prev, ...patch }));
  }, []);

  // ---------- exercise generation ----------

  const buildExercise = useCallback(async () => {
    const s = S.current;
    engine.stopDrone();
    if (s.droneTimer !== null) clearTimeout(s.droneTimer);
    const lv = LEVELS[s.levelIdx];
    if (!lv) return;

    const [lo, hi] = rangeBounds(s.loMidi, s.hiMidi, s.base);
    const dir = s.direction === "down" ? -1 : 1;
    const maxSpan = lv.steps.reduce((sum, n) => sum + n, 0);
    const sLo = dir > 0 ? lo : lo + maxSpan;
    const sHi = dir > 0 ? hi - maxSpan : hi;

    // Coverage-driven start selection: prefer notes you haven't sung yet.
    const uncovered: number[] = [];
    for (let m = sLo; m <= sHi; m++) if (!s.covered.has(m)) uncovered.push(m);
    const start =
      uncovered.length > 0
        ? pick(uncovered)
        : sHi >= sLo
          ? randInt(sLo, sHi)
          : Math.round((lo + hi) / 2);

    const notes = [start];
    for (const semis of lv.steps) {
      const cur = notes.at(-1) ?? start;
      let next = cur + dir * semis;
      next = Math.max(lo, Math.min(hi, next));
      notes.push(next);
    }

    s.targets = notes;
    s.idx = 0;
    s.holding = 0;
    s.supportPlayed = false;
    s.anchorHold = 0;
    s.wrongHold = 0;
    s.anchorArmed = true;
    s.trail = [];

    patchUi({
      targets: notes,
      idx: 0,
      status: s.mode === "ear" ? "Here's your start note — sing it, then find the next by ear." : "Listen to the target, then sing it.",
      statusVariant: "",
      liveNote: "—",
      liveCents: "",
      hasDrone: false,
    });

    await engine.waitForPiano();
    if (s.mode === "ear") {
      engine.playStartNote(midiToFreq(start));
    } else {
      engine.playTargets(notes.map(midiToFreq));
    }

    // Easy-mode drone: once the reference playback ends, hold a quiet drone on
    // note 1. Only for multi-note exercises — a single note is the whole drill.
    if (s.guideTone && notes.length > 1 && engine.audioCtx) {
      // The deafen window from playTargets is deterministic: 0.05 head + (n-1)*1s gap + 0.9s tail.
      const REF_HEAD_S = 0.05;
      const REF_GAP_S = 1.0;
      const REF_TAIL_S = 0.9;
      const deafenS = REF_HEAD_S + (notes.length - 1) * REF_GAP_S + REF_TAIL_S;
      const delayMs = deafenS * MS_PER_S + DRONE_START_DELAY_MS;
      const firstNote = notes[0];
      s.droneTimer = window.setTimeout(() => {
        if (s.running && s.idx === 0 && firstNote !== undefined) {
          engine.startDrone(midiToFreq(firstNote));
          patchUi({ hasDrone: true });
        }
      }, delayMs);
    }
  }, [engine, patchUi]);

  // ---------- advance / completion ----------

  const advance = useCallback(
    (silent: boolean): void => {
      const s = S.current;
      if (!silent) {
        engine.bip();
        flashCounter.current += 1;
      }
      // Only the START note counts toward range coverage.
      if (s.idx === 0) {
        const start = s.targets[0];
        if (start !== undefined) s.covered.add(start);
        engine.stopDrone();
      }
      s.holding = 0;
      s.supportPlayed = false;
      s.anchorHold = 0;
      s.wrongHold = 0;
      s.anchorArmed = true;
      s.idx += 1;

      const done = s.idx >= s.targets.length;
      const nextTarget = s.targets[s.idx];

      patchUi({
        idx: s.idx,
        flashKey: silent ? ui.flashKey : flashCounter.current,
        covered: [...s.covered],
        hasDrone: engine.hasDrone(),
        status: done
          ? "🎉 Nailed it! Here's what you sang…"
          : silent
            ? ui.status
            : nextTarget !== undefined
              ? `Good! Now sing ${midiToName(nextTarget)}.`
              : ui.status,
        statusVariant: done ? "good" : silent ? ui.statusVariant : "",
      });

      if (done) {
        // Replay the interval you just sang, note by note.
        const t0 = engine.now() + 0.15;
        s.targets.forEach((m, i) => engine.refNote(midiToFreq(m), t0 + i * REPLAY_GAP_S, REPLAY_DUR_S, 0.5));
        const playoutMs = REPLAY_HEAD_MS + s.targets.length * REPLAY_GAP_S * MS_PER_S + REPLAY_TAIL_MS;
        engine.deafenUntil(playoutMs / MS_PER_S);
        if (s.nextTimer !== null) clearTimeout(s.nextTimer);
        s.nextTimer = window.setTimeout(() => {
          if (s.running) void buildExercise();
        }, playoutMs + AUTO_REBUILD_PAD_MS);
      }
    },
    [engine, buildExercise, patchUi, ui.flashKey, ui.status, ui.statusVariant],
  );

  // ---------- pitch loop ----------

  const loop = useCallback(
    (ts: number) => {
      const s = S.current;
      if (!s.running) return;
      const dt = s.lastTs ? ts - s.lastTs : 16;
      s.lastTs = ts;

      const sample = engine.readPitch();
      const sungMidi = sample.midi;
      s.trail.push(sungMidi);
      if (s.trail.length > TRAIL_LENGTH) s.trail.shift();

      const target = s.targets[s.idx];
      const done = s.idx >= s.targets.length;
      const cue: CueState = done ? "next" : sample.muted ? "listen" : "sing";

      // Anchor beep — re-find the previous note between leaps.
      if (!done && s.idx > 0 && sample.singing && sungMidi != null && target !== undefined) {
        const anchor = s.targets[s.idx - 1];
        if (anchor !== undefined) {
          const onAnchor = Math.abs((sungMidi - anchor) * CENTS_PER_SEMITONE) <= s.tolCents;
          const onTarget = Math.abs((sungMidi - target) * CENTS_PER_SEMITONE) <= s.tolCents;
          if (onAnchor && !onTarget) {
            s.anchorHold += dt;
            if (s.anchorHold >= ANCHOR_HOLD_MS && s.anchorArmed) {
              engine.anchorBip();
              s.anchorArmed = false;
            }
          } else {
            s.anchorHold = 0;
            if (!onAnchor) s.anchorArmed = true;
          }
        }
      }

      let liveNote = "—";
      let liveCents = "";
      let status = ui.status;
      let statusVariant: UiSnapshot["statusVariant"] = ui.statusVariant;

      if (!done && sample.singing && sungMidi != null && target !== undefined) {
        const cents = (sungMidi - target) * CENTS_PER_SEMITONE;
        const absC = Math.abs(cents);
        liveNote = midiToName(Math.round(sungMidi));

        if (absC <= s.tolCents) {
          s.holding += dt;
          s.wrongHold = 0;
          const single = s.targets.length === 1;
          const isFinal = s.idx === s.targets.length - 1;
          const need = single ? s.holdMs : isFinal ? TOUCH_MS : PASS_MS;
          const pct = Math.min(100, (s.holding / need) * 100);
          liveCents = `${cents > 0 ? "+" : ""}${cents.toFixed(0)} cents  (target ${midiToName(target)})`;

          // Two-phase support only for the single-note sustain drill.
          if (single) {
            const half = need / 2;
            if (s.holding >= half && !s.supportPlayed) {
              s.supportPlayed = true;
              engine.tone(midiToFreq(target), engine.now(), 0.12, 0.25, "sine");
              engine.playSupport(midiToFreq(target), half / MS_PER_S);
            }
          }

          const next = s.targets[s.idx + 1];
          status =
            single || isFinal
              ? `On pitch — hold… ${pct.toFixed(0)}%`
              : `Good — now leap to ${next !== undefined ? midiToName(next) : "?"} ↗`;
          statusVariant = "good";

          if (s.holding >= need) advance(!single && !isFinal);
        } else {
          s.holding = Math.max(0, s.holding - dt * HOLD_DECAY_RATE);
          if (s.holding < s.holdMs / 2) s.supportPlayed = false;
          s.wrongHold += dt;
          if (s.wrongHold >= WRONG_NOTE_HINT_MS) {
            s.wrongHold = 0;
            status = "Here it is again — listen…";
            statusVariant = "";
            const startNote = s.targets[0];
            if (startNote !== undefined) engine.playHint(midiToFreq(startNote));
          } else {
            liveCents = `${cents > 0 ? "+" : ""}${cents.toFixed(0)} cents  (target ${midiToName(target)})`;
            const near = absC < s.tolCents * 2;
            status = near
              ? cents > 0
                ? "A touch high ↓"
                : "A touch low ↑"
              : cents > 0
                ? "Too high — come down"
                : "Too low — go up";
            statusVariant = "near";
          }
        }
      } else if (!done) {
        s.wrongHold = 0;
      }

      // Push a lightweight snapshot — only fields that actually changed will
      // trigger a re-render (React bails when Object.is agrees).
      patchUi({
        idx: s.idx,
        sungMidi,
        cue,
        liveNote,
        liveCents,
        status,
        statusVariant,
        hasDrone: engine.hasDrone(),
      });

      // Fire per-frame subscribers (used by PitchMeter to redraw).
      frameSubs.current.forEach((cb) => cb(dt));

      rafId.current = requestAnimationFrame(loop);
    },
    [engine, advance, patchUi, ui.status, ui.statusVariant],
  );

  const startLoop = useCallback(() => {
    const s = S.current;
    s.running = true;
    s.lastTs = 0;
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(loop);
  }, [loop]);

  const stopLoop = useCallback(() => {
    S.current.running = false;
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
  }, []);

  // ---------- actions ----------

  const startLevel = useCallback(
    async (levelIdx: number, config: TrainerConfig) => {
      const s = S.current;
      s.levelIdx = levelIdx;
      s.tolCents = config.tolCents;
      s.holdMs = config.holdMs;
      s.mode = config.mode;
      s.direction = config.direction;
      s.guideTone = config.guideTone;
      s.covered = new Set();

      // Use the saved range if we have one; otherwise fall back to the rough guess.
      const saved = loadSavedRange();
      if (saved) {
        s.loMidi = saved.lo;
        s.hiMidi = saved.hi;
        s.base = Math.round((saved.lo + saved.hi) / 2);
      } else {
        s.base = config.rangeFallback.base;
        s.loMidi = config.rangeFallback.lo;
        s.hiMidi = config.rangeFallback.hi;
      }

      patchUi({
        levelIdx,
        tolCents: config.tolCents,
        mode: config.mode,
        direction: config.direction,
        loMidi: s.loMidi,
        hiMidi: s.hiMidi,
        covered: [],
        running: true,
      });

      startLoop();
      await buildExercise();
    },
    [buildExercise, patchUi, startLoop],
  );

  const leaveTrainer = useCallback(() => {
    const s = S.current;
    if (s.nextTimer !== null) clearTimeout(s.nextTimer);
    if (s.droneTimer !== null) clearTimeout(s.droneTimer);
    engine.stopDrone();
    stopLoop();
    patchUi({ running: false, hasDrone: false });
  }, [engine, patchUi, stopLoop]);

  const replayAll = useCallback(() => {
    const s = S.current;
    engine.playTargets(s.targets.map(midiToFreq));
  }, [engine]);

  const playStartNote = useCallback(() => {
    const s = S.current;
    const first = s.targets[0];
    if (first !== undefined) engine.playStartNote(midiToFreq(first));
  }, [engine]);

  const playHint = useCallback(() => {
    const s = S.current;
    const first = s.targets[0];
    if (first !== undefined) engine.playHint(midiToFreq(first));
  }, [engine]);

  const skip = useCallback(() => {
    const s = S.current;
    s.holding = 0;
    s.supportPlayed = false;
    engine.stopDrone();
    s.idx += 1;
    const next = s.targets[s.idx];
    const done = s.idx >= s.targets.length;
    patchUi({
      idx: s.idx,
      hasDrone: false,
      status: done ? "Done. New exercise?" : next !== undefined ? `Sing ${midiToName(next)}.` : ui.status,
      statusVariant: done ? "good" : "",
    });
  }, [engine, patchUi, ui.status]);

  const toggleMode = useCallback(() => {
    const s = S.current;
    s.mode = s.mode === "ear" ? "guided" : "ear";
    patchUi({ mode: s.mode });
    if (s.idx < s.targets.length) {
      if (s.mode === "ear" && s.idx === 0) {
        const first = s.targets[0];
        if (first !== undefined) engine.playStartNote(midiToFreq(first));
      }
    }
  }, [engine, patchUi]);

  const toggleDirection = useCallback(() => {
    const s = S.current;
    s.direction = s.direction === "down" ? "up" : "down";
    patchUi({ direction: s.direction });
    if (s.nextTimer !== null) clearTimeout(s.nextTimer);
    void buildExercise();
  }, [buildExercise, patchUi]);

  const requestMic = useCallback(
    async (onDenied: (msg: string) => void): Promise<boolean> => {
      try {
        await engine.startMic(onDenied);
        return true;
      } catch {
        return false;
      }
    },
    [engine],
  );

  const reloadRangeFromStorage = useCallback(() => {
    const s = S.current;
    const saved = loadSavedRange();
    if (saved) {
      s.loMidi = saved.lo;
      s.hiMidi = saved.hi;
      s.base = Math.round((saved.lo + saved.hi) / 2);
      patchUi({ loMidi: s.loMidi, hiMidi: s.hiMidi });
    }
  }, [patchUi]);

  useEffect(() => {
    // Snapshot mutable refs so the cleanup sees the values current at unmount.
    const session = S.current;
    return () => {
      if (session.nextTimer !== null) clearTimeout(session.nextTimer);
      if (session.droneTimer !== null) clearTimeout(session.droneTimer);
      stopLoop();
      engine.dispose();
    };
  }, [engine, stopLoop]);

  const bufTrail = useCallback((): readonly (number | null)[] => S.current.trail, []);

  const onFrame = useCallback((cb: (dt: number) => void) => {
    frameSubs.current.add(cb);
    return () => {
      frameSubs.current.delete(cb);
    };
  }, []);

  return {
    ui,
    bufTrail,
    onFrame,
    engine,
    actions: {
      startLevel,
      leaveTrainer,
      buildExercise,
      replayAll,
      playStartNote,
      playHint,
      skip,
      toggleMode,
      toggleDirection,
      requestMic,
      reloadRangeFromStorage,
    },
  };
}

// Helper: expose the saveRange writer for the calibration hook.
export { saveRange };

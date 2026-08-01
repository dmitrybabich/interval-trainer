/* eslint-disable max-lines-per-function, sonarjs/cognitive-complexity, unicorn/no-lonely-if
   -- one cohesive hook; the pitch loop is inherently branchy and splitting it would fragment state. */
import { useCallback, useEffect, useRef, useState } from "react";

import { AudioEngine } from "@/audio/AudioEngine";
import { i18n } from "@/i18n";
import { resolveAnchor, scaleWalkSteps } from "@/lib/anchors";
import {
  ANCHOR_HOLD_MS,
  DEFAULT_PREFS,
  PASS_MS,
  TOUCH_MS,
  TRAIL_LENGTH,
  WRONG_NOTE_HINT_MS,
} from "@/lib/constants";
import { LEVELS } from "@/lib/levels";
import { midiToFreq, midiToName, midiToOctave, octaveBoundsWithin, pick, randInt, rangeBounds } from "@/lib/music";
import { loadAnchorChoices, loadSavedRange, saveRange } from "@/lib/persistence";
import { CLIMB_REPS, FOUNDATION_SPAN, ladderFor } from "@/lib/rungs";

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
  // Ladder progress — null when this level runs flat (free practice, single note,
  // triad). rungIdx indexes LADDER; rungReps counts clean reps toward the climb.
  ladder: { rungIdx: number; rungReps: number } | null;
}

export interface TrainerActions {
  startLevel(levelIdx: number, config: TrainerConfig): Promise<void>;
  leaveTrainer(): void;
  buildExercise(): Promise<void>;
  newExercise(): void;
  replayAll(): void;
  replayAnchor(): void;
  playStartNote(): void;
  playHint(): void;
  toggleMode(): void;
  toggleDirection(): void;
  climbRung(): void;
  requestMic(onDenied: (msg: string) => void): Promise<boolean>;
  reloadRangeFromStorage(): void;
}

export interface TrainerConfig {
  tolCents: number;
  holdMs: number;
  mode: "guided" | "ear";
  direction: "up" | "down";
  guideTone: boolean;
  foundHint: boolean;
  octaveMode: boolean;
  ladder: boolean;
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
  foundHint: boolean;
  octaveMode: boolean;
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
  // Armed once you leave the target's tolerance; disarmed after the "found it"
  // piano confirmation fires, so it plays once per seek rather than every frame.
  foundArmed: boolean;
  droneTimer: number | null;
  nextTimer: number | null;
  // Ladder state. ladder=false runs the classic flat path untouched. rungIdx
  // indexes LADDER; rungReps counts clean reps toward CLIMB_REPS. fixedRoot pins
  // the start note across reps on rungs 1–3 (null until first exercise picks it).
  // repClean flips false the moment you need a wrong-note hint, so a fumbled rep
  // doesn't count toward the climb.
  ladder: boolean;
  rungIdx: number;
  rungReps: number;
  fixedRoot: number | null;
  repClean: boolean;
  // Rung-1 "listen" has nothing to sing — freeze the scoring loop so singing
  // along can't advance or count; the user taps climbRung to move on.
  listenOnly: boolean;
}

function initSession(): SessionRefs {
  return {
    levelIdx: 0,
    tolCents: 50,
    holdMs: 3000,
    mode: DEFAULT_PREFS.mode,
    direction: DEFAULT_PREFS.direction,
    guideTone: false,
    foundHint: true,
    octaveMode: true,
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
    foundArmed: true,
    droneTimer: null,
    nextTimer: null,
    ladder: false,
    rungIdx: 0,
    rungReps: 0,
    fixedRoot: null,
    repClean: true,
    listenOnly: false,
  };
}

// Within the valid start window [sLo, sHi], pick the octave to drill next: the
// one with uncovered notes nearest the direction of travel (lowest first when
// ascending, highest first when descending). Falls back to the nearest octave
// once every octave is covered. Returns the octave's window clamped to [sLo, sHi].
function pickActiveOctave(
  sLo: number,
  sHi: number,
  covered: Set<number>,
  dir: number,
): readonly [number, number] | null {
  const octaves: number[] = [];
  for (let oct = midiToOctave(sLo); oct <= midiToOctave(sHi); oct++) octaves.push(oct);
  const ordered = dir > 0 ? octaves : octaves.toReversed();
  let fallback: readonly [number, number] | null = null;
  for (const oct of ordered) {
    const bounds = octaveBoundsWithin(oct, sLo, sHi);
    if (!bounds) continue;
    fallback ??= bounds;
    for (let m = bounds[0]; m <= bounds[1]; m++) {
      if (!covered.has(m)) return bounds; // first octave with an uncovered start
    }
  }
  return fallback;
}

// Next tonic for the foundation drill's "climb a key" step. Step up a semitone,
// but keep the WHOLE drill in range: the highest note sung is tonic + FOUNDATION_SPAN
// (the 5th), so once tonic+span would clear the ceiling, wrap back to the lowest
// tonic that still fits. Guarantees the 5th never sails above your range.
function nextFoundationTonic(tonic: number, lo: number, hi: number): number {
  const stepped = tonic + 1;
  return stepped + FOUNDATION_SPAN <= hi ? stepped : lo;
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
    status: i18n.t("status.listenGuided"),
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
    ladder: null,
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

    // The ladder overrides mode/guide/steps per rung; the flat path keeps the
    // config values set at startLevel. rung is null in flat mode. The single-note
    // level runs the foundation drill; single-interval levels run the interval
    // ladder (ladderFor picks).
    const ladder = ladderFor(lv.key);
    const rung = s.ladder ? ladder[s.rungIdx] : null;
    const interval = lv.steps[0];
    // Foundation rungs carry explicit degrees (absolute steps from the tonic);
    // otherwise fall back to the interval's leap, optionally scale-walked.
    const steps =
      rung?.degrees ??
      (rung?.shape === "walk" && interval !== undefined ? scaleWalkSteps(interval) : lv.steps);
    if (rung) {
      // Cold rung withholds the reference like ear mode; the rest play it like
      // guided. Driving s.mode off the rung lets the pitch loop's existing
      // ear/guided branches (chime-leak guard, status text) work unchanged.
      s.mode = rung.playReference ? "guided" : "ear";
      s.guideTone = rung.guide;
    }

    const [lo, hi] = rangeBounds(s.loMidi, s.hiMidi, s.base);
    const dir = s.direction === "down" ? -1 : 1;
    // Headroom the tonic needs: foundation degrees are absolute (top = max degree,
    // fixed across the whole drill so the octave never truncates the arpeggio);
    // interval steps accumulate.
    const maxSpan = rung?.degrees ? FOUNDATION_SPAN : steps.reduce((sum, n) => sum + n, 0);
    let sLo = dir > 0 ? lo : lo + maxSpan;
    let sHi = dir > 0 ? hi - maxSpan : hi;

    // Octave mode: confine the sweep to one octave at a time so the exercise
    // stays in a small, coherent register. Pick the octave with uncovered start
    // notes closest to the direction of travel (lowest first ascending, highest
    // first descending); once it's fully covered, roll to the next. Skipped for
    // fixed-root rungs — the root is pinned, so narrowing would do nothing.
    if (s.octaveMode && sHi >= sLo && !rung?.fixedRoot) {
      const active = pickActiveOctave(sLo, sHi, s.covered, dir);
      if (active) {
        sLo = active[0];
        sHi = active[1];
      }
    }

    // Fixed-root rungs reuse the pinned root across reps so you drill the same
    // leap; the first rep (and every random-root rung) picks coverage-first.
    let start: number;
    if (rung?.fixedRoot && s.fixedRoot !== null) {
      start = s.fixedRoot;
    } else {
      const uncovered: number[] = [];
      for (let m = sLo; m <= sHi; m++) if (!s.covered.has(m)) uncovered.push(m);
      start =
        uncovered.length > 0
          ? pick(uncovered)
          : sHi >= sLo
            ? randInt(sLo, sHi)
            : Math.round((lo + hi) / 2);
      if (rung?.fixedRoot) s.fixedRoot = start;
    }

    // Foundation degrees ARE the full note sequence as absolute offsets from the
    // tonic (C-E-C = [0,4,0], degree 0 = the tonic itself). Interval steps are
    // cumulative gaps between consecutive notes starting from `start`. Build each
    // accordingly, then clamp into the singable range.
    const clamp = (m: number) => Math.max(lo, Math.min(hi, m));
    let notes: number[];
    if (rung?.degrees) {
      notes = rung.degrees.map((d) => clamp(start + dir * d));
    } else {
      notes = [start];
      for (const semis of steps) {
        const cur = notes.at(-1) ?? start;
        notes.push(clamp(cur + dir * semis));
      }
    }

    s.targets = notes;
    s.idx = 0;
    s.holding = 0;
    s.supportPlayed = false;
    s.anchorHold = 0;
    s.wrongHold = 0;
    s.anchorArmed = true;
    s.foundArmed = true;
    s.repClean = true;
    s.trail = [];

    const listenOnly = rung ? !rung.sing : false;
    s.listenOnly = listenOnly;
    patchUi({
      targets: notes,
      idx: 0,
      status: listenOnly
        ? i18n.t("status.listenRung")
        : s.mode === "ear"
          ? i18n.t("status.listenEar")
          : i18n.t("status.listenGuided"),
      statusVariant: "",
      liveNote: "—",
      liveCents: "",
      hasDrone: false,
      ladder: s.ladder ? { rungIdx: s.rungIdx, rungReps: s.rungReps } : null,
    });

    await engine.waitForPiano();
    if (rung?.playAnchor) {
      // Rung 1 primer: the song-anchor melody (transposed to root), then the bare
      // interval. Anchor plays ascending from the root — it illustrates the
      // interval's sound; direction drilling begins when you start singing.
      const anchor = resolveAnchor(lv.key, loadAnchorChoices()[lv.key]);
      const anchorNotes = anchor
        ? anchor.notes.map((n) => ({ freq: midiToFreq(start + n.offset), beats: n.beats }))
        : [];
      engine.playAnchorPrimer(anchorNotes, notes.map(midiToFreq));
    } else if (s.mode === "ear") {
      engine.playStartNote(midiToFreq(start));
    } else {
      engine.playTargets(notes.map(midiToFreq));
    }

    // Easy-mode drone: once the reference playback ends, hold a quiet drone on
    // note 1. Only for multi-note exercises — a single note is the whole drill.
    // Skipped on the listen-only rung (playAnchor) — nothing to sing under.
    if (s.guideTone && !rung?.playAnchor && notes.length > 1 && engine.audioCtx) {
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
      s.foundArmed = true; // re-arm for the next note in the sequence
      s.idx += 1;

      const done = s.idx >= s.targets.length;
      const nextTarget = s.targets[s.idx];

      // Ladder climb: a clean completed rep counts toward CLIMB_REPS. A rep that
      // needed a wrong-note hint (repClean=false) doesn't count.
      //
      // Interval ladder: climbing a rung repicks the root (fixedRoot cleared) and
      // it tops out at the last rung.
      // Foundation drill: the tonic is HELD across all rungs (master one key);
      // only after clearing the LAST rung does the key climb a semitone and the
      // rungs restart from the top — the "move your hand up one key" step.
      let climbed = false;
      if (done && s.ladder) {
        const ladder = ladderFor(LEVELS[s.levelIdx]?.key ?? "");
        const isFoundation = Boolean(ladder[s.rungIdx]?.degrees);
        if (s.repClean) s.rungReps += 1;
        if (s.rungReps >= CLIMB_REPS) {
          if (s.rungIdx < ladder.length - 1) {
            s.rungIdx += 1;
            s.rungReps = 0;
            if (!isFoundation) s.fixedRoot = null; // foundation keeps the key
            climbed = true;
          } else if (isFoundation && s.fixedRoot !== null) {
            // Whole key cleared — step the tonic up a semitone (wrapping so the
            // 5th stays in range), restart the rungs.
            const [lo, hi] = rangeBounds(s.loMidi, s.hiMidi, s.base);
            s.rungIdx = 0;
            s.rungReps = 0;
            s.fixedRoot = nextFoundationTonic(s.fixedRoot, lo, hi);
            climbed = true;
          }
        }
      }

      patchUi({
        idx: s.idx,
        flashKey: silent ? ui.flashKey : flashCounter.current,
        covered: [...s.covered],
        hasDrone: engine.hasDrone(),
        ladder: s.ladder ? { rungIdx: s.rungIdx, rungReps: s.rungReps } : null,
        status: done
          ? climbed
            ? i18n.t("status.rungUp")
            : i18n.t("status.nailedIt")
          : silent
            ? ui.status
            : nextTarget !== undefined
              ? i18n.t("status.goodNext", { note: midiToName(nextTarget) })
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
      // Listen-only rung: don't track pitch at all — no trail, no needle. Feeding
      // nulls keeps the meter clean so it doesn't read as a drill you're failing.
      const sungMidi = s.listenOnly ? null : sample.midi;
      s.trail.push(sungMidi);
      if (s.trail.length > TRAIL_LENGTH) s.trail.shift();

      const target = s.targets[s.idx];
      const done = s.idx >= s.targets.length;
      // Listen-only rung never cues "sing" — you're only meant to take the sound in.
      const cue: CueState = s.listenOnly ? "listen" : done ? "next" : sample.muted ? "listen" : "sing";

      // Anchor beep — re-find the previous note between leaps.
      if (!done && !s.listenOnly && s.idx > 0 && sample.singing && sungMidi != null && target !== undefined) {
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

      if (s.listenOnly) {
        // Rung 1 is purely passive: no cue, no readout, no scoring — just take in
        // the sound. Nothing here should imply you're being measured.
      } else if (!done && sample.singing && sungMidi != null && target !== undefined) {
        const cents = (sungMidi - target) * CENTS_PER_SEMITONE;
        const absC = Math.abs(cents);
        liveNote = midiToName(Math.round(sungMidi));

        if (absC <= s.tolCents) {
          // "Found it" confirmation: the first frame you overlap the target while
          // seeking, play it on piano (mic deafened during playback). Fires once
          // per seek — re-armed when you drift back off-target below.
          // In ear mode we only confirm the FIRST note; chiming later notes would
          // reveal the by-ear answer the instant you stumble onto it.
          const mayChime = s.mode !== "ear" || s.idx === 0;
          if (s.foundHint && s.foundArmed && mayChime) {
            engine.playFoundNote(midiToFreq(target));
            s.foundArmed = false;
          }
          s.holding += dt;
          s.wrongHold = 0;
          const single = s.targets.length === 1;
          const isFinal = s.idx === s.targets.length - 1;
          const need = single ? s.holdMs : isFinal ? TOUCH_MS : PASS_MS;
          const pct = Math.min(100, (s.holding / need) * 100);
          liveCents = i18n.t("status.cents", {
            sign: cents > 0 ? "+" : "",
            cents: cents.toFixed(0),
            note: midiToName(target),
          });

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
              ? i18n.t("status.onPitchHold", { pct: pct.toFixed(0) })
              : i18n.t("status.leapTo", { note: next !== undefined ? midiToName(next) : "?" });
          statusVariant = "good";

          if (s.holding >= need) advance(!single && !isFinal);
        } else {
          s.foundArmed = true; // drifted off — re-arm the "found it" confirmation
          s.holding = Math.max(0, s.holding - dt * HOLD_DECAY_RATE);
          if (s.holding < s.holdMs / 2) s.supportPlayed = false;
          s.wrongHold += dt;
          if (s.wrongHold >= WRONG_NOTE_HINT_MS) {
            s.wrongHold = 0;
            s.repClean = false; // needed a hint — this rep won't count toward the climb
            status = i18n.t("status.hearItAgain");
            statusVariant = "";
            const startNote = s.targets[0];
            if (startNote !== undefined) engine.playHint(midiToFreq(startNote));
          } else {
            liveCents = i18n.t("status.cents", {
              sign: cents > 0 ? "+" : "",
              cents: cents.toFixed(0),
              note: midiToName(target),
            });
            const near = absC < s.tolCents * 2;
            status = near
              ? cents > 0
                ? i18n.t("status.touchHigh")
                : i18n.t("status.touchLow")
              : cents > 0
                ? i18n.t("status.tooHigh")
                : i18n.t("status.tooLow");
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
      s.foundHint = config.foundHint;
      s.octaveMode = config.octaveMode;
      s.covered = new Set();
      s.ladder = config.ladder;
      s.rungIdx = 0;
      s.rungReps = 0;
      s.fixedRoot = null;
      s.listenOnly = false;

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
        ladder: config.ladder ? { rungIdx: 0, rungReps: 0 } : null,
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

  // Re-hear the song anchor on demand from any rung: the melody transposed to the
  // current root, then the bare interval — same primer as rung 1. No-op if this
  // interval has no curated anchor.
  const replayAnchor = useCallback(() => {
    const s = S.current;
    const lv = LEVELS[s.levelIdx];
    const root = s.targets[0];
    if (!lv || root === undefined) return;
    const anchor = resolveAnchor(lv.key, loadAnchorChoices()[lv.key]);
    if (!anchor) return;
    const anchorNotes = anchor.notes.map((n) => ({ freq: midiToFreq(root + n.offset), beats: n.beats }));
    const intervalFreqs = [root, root + (lv.steps[0] ?? 0)].map(midiToFreq);
    engine.playAnchorPrimer(anchorNotes, intervalFreqs);
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

  // Advance to the next rung on demand: rung 1 (listen) has nothing to score, so
  // the user taps to move on; also a manual escape from any rung. No-op at the top.
  const climbRung = useCallback(() => {
    const s = S.current;
    const ladder = ladderFor(LEVELS[s.levelIdx]?.key ?? "");
    if (!s.ladder) return;
    const atTop = s.rungIdx >= ladder.length - 1;
    const isFoundation = Boolean(ladder[s.rungIdx]?.degrees);
    // Interval ladder tops out; foundation wraps: last rung → step the key up and
    // restart the rungs (the "move your hand up one key" step).
    if (atTop && !(isFoundation && s.fixedRoot !== null)) return;
    if (s.nextTimer !== null) clearTimeout(s.nextTimer);
    if (atTop && isFoundation && s.fixedRoot !== null) {
      const [lo, hi] = rangeBounds(s.loMidi, s.hiMidi, s.base);
      s.rungIdx = 0;
      s.fixedRoot = nextFoundationTonic(s.fixedRoot, lo, hi);
    } else {
      s.rungIdx += 1;
      if (!ladder[s.rungIdx]?.degrees) s.fixedRoot = null; // interval ladder repicks
    }
    s.rungReps = 0;
    patchUi({ ladder: { rungIdx: s.rungIdx, rungReps: 0 } });
    void buildExercise();
  }, [buildExercise, patchUi]);

  // "New exercise": drop a fresh one with a NEW root. Fixed-root drills otherwise
  // reuse the pinned root, so a plain rebuild looks dead — clear it here. The
  // foundation drill also resets to step 1 (a new key, from the beginning).
  const newExercise = useCallback(() => {
    const s = S.current;
    const ladder = ladderFor(LEVELS[s.levelIdx]?.key ?? "");
    if (s.nextTimer !== null) clearTimeout(s.nextTimer);
    s.fixedRoot = null;
    if (s.ladder && Boolean(ladder[s.rungIdx]?.degrees)) {
      s.rungIdx = 0;
      s.rungReps = 0;
      patchUi({ ladder: { rungIdx: 0, rungReps: 0 } });
    }
    void buildExercise();
  }, [buildExercise, patchUi]);

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
      newExercise,
      replayAll,
      replayAnchor,
      playStartNote,
      playHint,
      toggleMode,
      toggleDirection,
      climbRung,
      requestMic,
      reloadRangeFromStorage,
    },
  };
}

// Helper: expose the saveRange writer for the calibration hook.
export { saveRange };

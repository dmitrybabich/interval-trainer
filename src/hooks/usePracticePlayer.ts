/* eslint-disable max-lines-per-function -- one cohesive player engine: backing
   (media element OR MIDI transport) + mic pitch + optional scoring + recording,
   sharing refs; splitting it would fragment them. */
import { useCallback, useEffect, useRef, useState } from "react";

import { ExerciseTransport } from "@/hooks/useExercises";
import { usePitchTrail } from "@/hooks/usePitchTrail";
import type { VoiceSample } from "@/hooks/useWarmup";
import { ContourScorer, type ContourSummary, EMPTY_CONTOUR_SUMMARY } from "@/lib/contourScore";
import type { ResolvedItem } from "@/lib/practiceItems";

const SCORE_UI_MS = 200;

export interface PracticePlayerUi {
  ready: boolean; // mic granted
  playing: boolean;
  recording: boolean;
  currentTime: number;
  duration: number;
  score: ContourSummary;
}

const INITIAL: PracticePlayerUi = {
  ready: false,
  playing: false,
  recording: false,
  currentTime: 0,
  duration: 0,
  score: EMPTY_CONTOUR_SUMMARY,
};

export interface PracticePlayerApi {
  ui: PracticePlayerUi;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  trailRef: () => readonly VoiceSample[];
  currentTimeRef: () => number;
  onFrame: (cb: () => void) => () => void;
  start: (onDenied: (msg: string) => void) => Promise<boolean>;
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
  toggleRecord: () => void;
}

/**
 * The one player for any practice item. Backing is a media element (audio/video) or
 * a MIDI arrangement on the sampled piano; both expose play/pause/seek/position. The
 * mic drives a live pitch trail, scored against the item's reference when it has one.
 * Recording starts from the current playhead and hands the take to `onTake`.
 */
export function usePracticePlayer(
  item: ResolvedItem | null,
  tolCents: number,
  anyOctave: boolean,
  onTake: (blob: Blob, durationS: number) => void,
): PracticePlayerApi {
  const [ui, setUi] = useState<PracticePlayerUi>(INITIAL);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const transportRef = useRef<ExerciseTransport | null>(null);
  const scorer = useRef(new ContourScorer());
  const isMidi = item?.backing.kind === "midi";
  const isMidiRef = useRef(isMidi);
  isMidiRef.current = isMidi;
  const recording = useRef(false);
  const playing = useRef(false);
  const recStartedAt = useRef(0);
  const lastTs = useRef(0);
  const latest = useRef<() => VoiceSample | undefined>(() => undefined);
  const onTakeRef = useRef(onTake);
  onTakeRef.current = onTake;

  const position = useCallback(
    (): number => (isMidiRef.current ? (transportRef.current?.position() ?? 0) : (mediaRef.current?.currentTime ?? 0)),
    [],
  );
  const duration = useCallback(
    (): number => (isMidiRef.current ? (transportRef.current?.duration ?? 0) : (mediaRef.current?.duration ?? 0)),
    [],
  );

  const onTick = useCallback(() => {
    const sample = latest.current();
    // Only score while the backing is actually playing — a paused transport must not
    // keep folding the singer's idle mic noise into the running score.
    if (sample && playing.current) scorer.current.record(sample);
    const nowMs = performance.now();
    if (nowMs - lastTs.current < SCORE_UI_MS) return;
    lastTs.current = nowMs;
    // MIDI transport runs off the audio clock — detect its end here; media fires 'ended'.
    if (isMidiRef.current && transportRef.current?.isPlaying() && position() >= duration()) {
      transportRef.current.rewind();
      setUi((cur) => ({ ...cur, playing: false, currentTime: 0 }));
      return;
    }
    setUi((cur) => ({ ...cur, currentTime: position(), duration: duration(), score: scorer.current.snapshot() }));
  }, [position, duration]);

  const isPlaying = useCallback(() => playing.current, []);
  const pitch = usePitchTrail(position, onTick, isPlaying);
  latest.current = () => pitch.trailRef().at(-1);

  // Mirror the play flag into a ref the rAF loop can read without re-subscribing.
  useEffect(() => {
    playing.current = ui.playing;
  }, [ui.playing]);
  transportRef.current ??= new ExerciseTransport(pitch.engineRef.current);

  // Adopt the item: load the MIDI arrangement (or clear it) + the reference contour.
  useEffect(() => {
    transportRef.current?.load(item?.backing.kind === "midi" ? { sound: item.backing.sound, duration: item.backing.duration } : null);
    scorer.current.load(item?.reference ?? [], tolCents, anyOctave);
    recording.current = false;
    playing.current = false;
    setUi((cur) => ({ ...INITIAL, ready: cur.ready }));
  }, [item, tolCents, anyOctave]);

  // Media transport events → React state (midi state is driven from onTick).
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || isMidi) return;
    const onPlay = () => setUi((cur) => ({ ...cur, playing: true }));
    const onPause = () => setUi((cur) => ({ ...cur, playing: false }));
    const onMeta = () => setUi((cur) => ({ ...cur, duration: el.duration }));
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("loadedmetadata", onMeta);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [item, isMidi]);

  const start = useCallback(
    (onDenied: (msg: string) => void) => pitch.start(onDenied, () => setUi((cur) => ({ ...cur, ready: true }))),
    [pitch],
  );

  // If the mic is already granted, reopen it silently on mount so navigating between
  // practice items doesn't re-show the gate (getUserMedia won't re-prompt once granted).
  useEffect(() => {
    if (ui.ready || !navigator.permissions?.query) return undefined;
    let cancelled = false;
    void navigator.permissions
      .query({ name: "microphone" })
      .then((status) => {
        if (!cancelled && status.state === "granted") void start(() => undefined);
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ui.ready, start]);

  const play = useCallback(() => {
    if (isMidiRef.current) {
      void transportRef.current?.play().then(() => setUi((cur) => ({ ...cur, playing: true })));
    } else {
      void mediaRef.current?.play();
    }
  }, []);

  const pause = useCallback(() => {
    if (isMidiRef.current) {
      transportRef.current?.pause();
      setUi((cur) => ({ ...cur, playing: false }));
    } else {
      mediaRef.current?.pause();
    }
  }, []);

  const seek = useCallback(
    (sec: number) => {
      if (isMidiRef.current) transportRef.current?.seek(sec);
      else if (mediaRef.current) mediaRef.current.currentTime = sec;
      scorer.current.reset();
      pitch.clearTrail();
      setUi((cur) => ({ ...cur, currentTime: sec, score: EMPTY_CONTOUR_SUMMARY }));
    },
    [pitch],
  );

  const toggleRecord = useCallback(() => {
    const engine = pitch.engineRef.current;
    if (recording.current) {
      recording.current = false;
      const durationS = (performance.now() - recStartedAt.current) / 1000;
      void engine.stopRecording().then((blob) => {
        if (blob) onTakeRef.current(blob, durationS);
        return undefined;
      });
      pause();
      setUi((cur) => ({ ...cur, recording: false }));
      return;
    }
    // Record from the current playhead — don't rewind.
    scorer.current.reset();
    pitch.clearTrail();
    if (!ui.playing) play();
    engine.startRecording();
    recording.current = true;
    recStartedAt.current = performance.now();
    setUi((cur) => ({ ...cur, recording: true, score: EMPTY_CONTOUR_SUMMARY }));
  }, [pitch, play, pause, ui.playing]);

  return {
    ui,
    mediaRef,
    trailRef: pitch.trailRef,
    currentTimeRef: position,
    onFrame: pitch.onFrame,
    start,
    play,
    pause,
    seek,
    toggleRecord,
  };
}

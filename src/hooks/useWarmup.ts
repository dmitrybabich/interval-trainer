import { useCallback, useEffect, useRef, useState } from "react";

import { AudioEngine } from "@/audio/AudioEngine";

// One frame of your sung pitch, stamped against the audio clock so the meter can
// place it under whatever reference note was sounding at that moment.
export interface VoiceSample {
  t: number; // audio.currentTime when sampled
  midi: number | null; // fractional MIDI, null when not singing
}

// How many recent voice samples the trail keeps. The meter only draws the window
// that's on screen, but a generous buffer means scrubbing back shows history too.
const TRAIL_CAP = 2400;

export interface WarmupUi {
  ready: boolean; // mic granted and engine live
  playing: boolean;
  currentTime: number;
  duration: number;
  status: string;
}

// Mirror the <audio> element's play/pause/time/duration into React state so the
// transport UI (button, scrubber, timestamps) tracks it.
function useAudioTransport(
  audioRef: React.RefObject<HTMLAudioElement>,
  setUi: React.Dispatch<React.SetStateAction<WarmupUi>>,
  dep: string,
): void {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setUi((cur) => ({ ...cur, playing: true }));
    const onPause = () => setUi((cur) => ({ ...cur, playing: false }));
    const onTime = () => setUi((cur) => ({ ...cur, currentTime: audio.currentTime }));
    const onMeta = () => setUi((cur) => ({ ...cur, duration: audio.duration }));
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
}

/**
 * Self-contained engine for the warm-up sing-along: owns its own AudioEngine +
 * mic + rAF loop, and an <audio> element playing the backing track. Unlike
 * useTrainer there's no scoring, no targets, no deafening — you wear headphones,
 * so the track never bleeds into the mic. The loop just samples your pitch each
 * frame and stamps it against audio.currentTime; the meter overlays it on the
 * reference notes and colors green whatever lands within tolerance.
 */
export function useWarmup(audioSrc: string): {
  ui: WarmupUi;
  audioRef: React.RefObject<HTMLAudioElement>;
  trailRef: () => readonly VoiceSample[];
  currentTimeRef: () => number;
  onFrame: (cb: () => void) => () => void;
  start: (onDenied: (msg: string) => void) => Promise<boolean>;
  togglePlay: () => void;
  seek: (sec: number) => void;
  stop: () => void;
} {
  const engineRef = useRef<AudioEngine>(new AudioEngine());
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafId = useRef<number | null>(null);
  const trail = useRef<VoiceSample[]>([]);
  const frameCbs = useRef(new Set<() => void>());

  const [ui, setUi] = useState<WarmupUi>({ ready: false, playing: false, currentTime: 0, duration: 0, status: "" });

  const loop = useCallback(() => {
    const t = audioRef.current?.currentTime ?? 0;
    const sample = engineRef.current.readPitch();
    trail.current.push({ t, midi: sample.singing ? sample.midi : null });
    if (trail.current.length > TRAIL_CAP) trail.current.shift();
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
      setUi((cur) => ({ ...cur, ready: true, status: "" }));
      rafId.current ??= requestAnimationFrame(loop);
      return true;
    },
    [loop],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seek = useCallback((sec: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = sec;
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    engineRef.current.dispose();
    trail.current = [];
  }, []);

  useAudioTransport(audioRef, setUi, audioSrc);

  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      engine.dispose();
    };
  }, []);

  const trailRef = useCallback((): readonly VoiceSample[] => trail.current, []);
  const currentTimeRef = useCallback((): number => audioRef.current?.currentTime ?? 0, []);
  const onFrame = useCallback((cb: () => void) => {
    frameCbs.current.add(cb);
    return () => frameCbs.current.delete(cb);
  }, []);

  return { ui, audioRef, trailRef, currentTimeRef, onFrame, start, togglePlay, seek, stop };
}

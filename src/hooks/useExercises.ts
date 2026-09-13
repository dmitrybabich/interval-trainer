import { useCallback, useEffect, useRef, useState } from "react";

import { AudioEngine } from "@/audio/AudioEngine";
import { usePitchTrail } from "@/hooks/usePitchTrail";
import type { VoiceSample } from "@/hooks/useWarmup";
import { loadExercise, type ParsedExercise } from "@/lib/exercises";

// A little lead so the first scheduled notes don't land in the past.
const SCHEDULE_LEAD_S = 0.15;

export interface ExerciseUi {
  ready: boolean; // mic granted and engine live
  loading: boolean; // MIDI still parsing
  playing: boolean;
  currentTime: number;
  duration: number;
}

const INITIAL_UI: ExerciseUi = { ready: false, loading: true, playing: false, currentTime: 0, duration: 0 };

// Fetch + parse the selected exercise's MIDI. Cached in the lib, so re-selecting
// a track is instant.
export function useParsedExercise(url: string): { data: ParsedExercise | null; loading: boolean } {
  const [data, setData] = useState<ParsedExercise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadExercise(url).then((parsed) => {
      if (!cancelled) {
        setData(parsed);
        setLoading(false);
      }
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, loading };
}

/**
 * The exercise transport: schedules the backing (accompaniment + melody guide)
 * straight onto the sampled piano and tracks position against the AudioContext
 * clock. Plain and imperative — no <audio> element, no React — like AudioEngine.
 */
// The playable slice a transport needs — a bag of scheduled notes and a length.
// Both MIDI exercises and MIDI songs supply this.
export interface Playable {
  sound: readonly { t: number; midi: number; dur: number; gain: number }[];
  duration: number;
}

export class ExerciseTransport {
  private notes: readonly { t: number; midi: number; dur: number; gain: number }[] = [];
  private durationS = 0;
  private playing = false;
  private pausedAt = 0; // exercise-time when paused / stopped
  private origin = 0; // AudioContext time that maps to exercise-time 0
  private pauseAnchor = 0; // AudioContext time the current pause began, for the free-run scroll
  private rate = 1; // playback speed: exercise-time advances `rate`× wall-time

  constructor(private readonly engine: AudioEngine) {}

  load(data: Playable | null): void {
    this.engine.stopScheduled();
    this.notes = data?.sound ?? [];
    this.durationS = data?.duration ?? 0;
    this.playing = false;
    this.pausedAt = 0;
    this.pauseAnchor = this.engine.now();
  }

  get duration(): number {
    return this.durationS;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  // Change playback speed. While playing, reschedule from the current position so
  // the new tempo takes effect immediately without a pitch shift (piano notes just
  // sustain longer/shorter).
  setRate(rate: number): void {
    if (rate <= 0 || rate === this.rate) return;
    const pos = this.position();
    this.rate = rate;
    if (this.playing) {
      this.engine.stopScheduled();
      this.scheduleFrom(pos);
    }
  }

  // The scored position along the exercise: advances only while playing.
  position(): number {
    if (!this.playing) return this.pausedAt;
    return Math.min(Math.max((this.engine.now() - this.origin) * this.rate, 0), this.durationS);
  }

  // The roll's scroll clock. While playing it tracks the exercise; while paused it
  // keeps free-running on wall time from the paused position, so the live sung
  // pitch still scrolls even though the backing (and scored position) sit still.
  scrollTime(): number {
    if (this.playing) return this.position();
    return this.pausedAt + Math.max(0, this.engine.now() - this.pauseAnchor) * this.rate;
  }

  // The frozen exercise position while paused (so the roll can pin notes there),
  // or null while playing.
  pausedPosition(): number | null {
    return this.playing ? null : this.pausedAt;
  }

  // Re-anchor the free-run scroll to "now" — call when the mic goes live so the
  // pre-play idle view starts near zero instead of the raw AudioContext clock.
  resetScrollClock(): void {
    this.pauseAnchor = this.engine.now();
  }

  private scheduleFrom(fromT: number): void {
    const when0 = this.engine.now() + SCHEDULE_LEAD_S;
    this.origin = when0 - fromT / this.rate;
    for (const n of this.notes) {
      const end = n.t + n.dur;
      if (end <= fromT) continue;
      const when = when0 + Math.max(0, n.t - fromT) / this.rate;
      const durExercise = (n.t >= fromT ? n.dur : end - fromT) / this.rate;
      this.engine.scheduleNote(n.midi, when, durExercise, n.gain);
    }
    this.playing = true;
  }

  async play(): Promise<void> {
    if (this.playing) return;
    if (this.pausedAt >= this.durationS) this.pausedAt = 0;
    await this.engine.waitForPiano();
    this.scheduleFrom(this.pausedAt);
  }

  pause(): void {
    this.pausedAt = this.position();
    this.playing = false;
    this.pauseAnchor = this.engine.now();
    this.engine.stopScheduled();
  }

  seek(sec: number): number {
    const clamped = Math.min(Math.max(sec, 0), this.durationS);
    const wasPlaying = this.playing;
    this.engine.stopScheduled();
    this.pausedAt = clamped;
    if (wasPlaying) this.scheduleFrom(clamped);
    else this.pauseAnchor = this.engine.now();
    return clamped;
  }

  // Called when playback runs off the end: stop and rewind to the start.
  rewind(): void {
    this.engine.stopScheduled();
    this.playing = false;
    this.pausedAt = 0;
    this.pauseAnchor = this.engine.now();
  }
}

/**
 * Sing-along engine for the MIDI exercises. Wires the pitch-trail loop to an
 * ExerciseTransport: the backing plays on the sampled piano, the meter overlays
 * your voice on the melody line and greens whatever lands in tune.
 */
export function useExercises(data: ParsedExercise | null): {
  ui: ExerciseUi;
  trailRef: () => readonly VoiceSample[];
  currentTimeRef: () => number;
  pausedNoteTimeRef: () => number | null;
  onFrame: (cb: () => void) => () => void;
  start: (onDenied: (msg: string) => void) => Promise<boolean>;
  togglePlay: () => void;
  seek: (sec: number) => void;
  stop: () => void;
} {
  const [ui, setUi] = useState<ExerciseUi>(INITIAL_UI);
  const lastUiTime = useRef(0);
  const transportRef = useRef<ExerciseTransport | null>(null);

  // The roll scrolls on the transport's free-run clock; the scrubber tracks the
  // scored position (frozen while paused).
  const scrollTime = useCallback((): number => transportRef.current?.scrollTime() ?? 0, []);
  const pausedNoteTime = useCallback((): number | null => transportRef.current?.pausedPosition() ?? null, []);

  // Advance the scrubber (throttled — the canvas reads time imperatively), and
  // when playback runs off the end, rewind and flip the transport back to paused.
  const onTick = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    if (transport.isPlaying() && transport.position() >= transport.duration) {
      transport.rewind();
      lastUiTime.current = 0;
      setUi((cur) => ({ ...cur, playing: false, currentTime: 0 }));
      return;
    }
    const pos = transport.position();
    if (Math.abs(pos - lastUiTime.current) >= 0.1) {
      lastUiTime.current = pos;
      setUi((cur) => ({ ...cur, currentTime: pos }));
    }
  }, []);

  const pitch = usePitchTrail(scrollTime, onTick);
  transportRef.current ??= new ExerciseTransport(pitch.engineRef.current);

  const start = useCallback(
    (onDenied: (msg: string) => void) =>
      pitch.start(onDenied, () => {
        transportRef.current?.resetScrollClock();
        setUi((cur) => ({ ...cur, ready: true }));
      }),
    [pitch],
  );

  const togglePlay = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    // Fresh trace on each transition: paused free-run shows only what you sing
    // after pausing; a new run starts clean.
    pitch.clearTrail();
    if (transport.isPlaying()) {
      transport.pause();
      setUi((cur) => ({ ...cur, playing: false }));
      return;
    }
    void transport.play().then(() => setUi((cur) => ({ ...cur, playing: true })));
  }, [pitch]);

  const seek = useCallback((sec: number) => {
    const clamped = transportRef.current?.seek(sec) ?? 0;
    lastUiTime.current = clamped;
    setUi((cur) => ({ ...cur, currentTime: clamped }));
  }, []);

  const stop = useCallback(() => {
    transportRef.current?.rewind();
    pitch.stop();
  }, [pitch]);

  // Swapping exercises: stop the old one, reset the transport, adopt the new notes.
  useEffect(() => {
    transportRef.current?.load(data);
    lastUiTime.current = 0;
    setUi((cur) => ({ ...cur, playing: false, currentTime: 0, loading: data === null, duration: data?.duration ?? 0 }));
  }, [data]);

  return {
    ui,
    trailRef: pitch.trailRef,
    currentTimeRef: scrollTime,
    pausedNoteTimeRef: pausedNoteTime,
    onFrame: pitch.onFrame,
    start,
    togglePlay,
    seek,
    stop,
  };
}

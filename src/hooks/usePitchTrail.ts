import { useCallback, useEffect, useMemo, useRef } from "react";

import { AudioEngine } from "@/audio/AudioEngine";
import type { VoiceSample } from "@/hooks/useWarmup";

// How many recent voice samples the trail keeps. The meter only draws the window
// that's on screen, but a generous buffer means scrubbing back shows history too.
const TRAIL_CAP = 2400;

/**
 * The mic + rAF machinery shared by the sing-alongs: owns the AudioEngine, samples
 * pitch each frame stamped at `timeOf()`, keeps a scrolling voice trail, and fans
 * the frame out to canvas subscribers. `onTick` lets the caller react to the clock
 * (advance the scrubber, score the sample, detect the end) without owning the loop.
 */
export function usePitchTrail(
  timeOf: () => number,
  onTick: () => void,
  active: () => boolean = () => true,
): {
  engineRef: React.MutableRefObject<AudioEngine>;
  trailRef: () => readonly VoiceSample[];
  clearTrail: () => void;
  onFrame: (cb: () => void) => () => void;
  start: (onDenied: (msg: string) => void, onReady: () => void) => Promise<boolean>;
  stop: () => void;
} {
  const engineRef = useRef<AudioEngine>(new AudioEngine());
  const rafId = useRef<number | null>(null);
  const trail = useRef<VoiceSample[]>([]);
  const frameCbs = useRef(new Set<() => void>());

  const loop = useCallback(() => {
    // Only accumulate the trail while the backing is advancing — otherwise a paused
    // transport freezes `timeOf()` and every frame piles another sample onto the same
    // timestamp, smearing the roll and skewing the score.
    if (active()) {
      const t = timeOf();
      const sample = engineRef.current.readPitch();
      trail.current.push({ t, midi: sample.singing ? sample.midi : null });
      if (trail.current.length > TRAIL_CAP) trail.current.shift();
    }
    onTick();
    frameCbs.current.forEach((cb) => cb());
    rafId.current = requestAnimationFrame(loop);
  }, [timeOf, onTick, active]);

  const start = useCallback(
    async (onDenied: (msg: string) => void, onReady: () => void): Promise<boolean> => {
      try {
        await engineRef.current.startMic(onDenied);
      } catch {
        return false;
      }
      onReady();
      rafId.current ??= requestAnimationFrame(loop);
      return true;
    },
    [loop],
  );

  const stop = useCallback(() => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    rafId.current = null;
    trail.current = [];
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      engine.dispose();
    };
  }, []);

  const trailRef = useCallback((): readonly VoiceSample[] => trail.current, []);
  const clearTrail = useCallback(() => {
    trail.current = [];
  }, []);
  const onFrame = useCallback((cb: () => void) => {
    frameCbs.current.add(cb);
    return () => frameCbs.current.delete(cb);
  }, []);

  // Stable wrapper: every member is already stable, so a consumer that puts this in
  // a dependency array (or derives a callback from it) doesn't re-run every render.
  return useMemo(
    () => ({ engineRef, trailRef, clearTrail, onFrame, start, stop }),
    [trailRef, clearTrail, onFrame, start, stop],
  );
}

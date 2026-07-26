/* eslint-disable max-lines-per-function -- calibration state machine kept in one hook. */
import { useCallback, useEffect, useRef, useState } from "react";

import type { AudioEngine } from "@/audio/AudioEngine";
import { midiToName } from "@/lib/music";
import { saveRange } from "@/lib/persistence";

// Median of collected samples, rounded to nearest semitone.
function median(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const s = [...samples].toSorted((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]);
}

export type CalibPhase = "low" | "high" | "done";
export type CalibCue = "ready" | "capturing";

interface CalibUi {
  phase: CalibPhase;
  cue: CalibCue;
  liveNote: string;
  hint: string;
  actionLabel: string;
  status: string;
  statusVariant: "" | "good" | "near";
  result: string;
  capturing: boolean;
  lowCaptured: number | null;
  finishedRange: { lo: number; hi: number } | null;
}

const CAPTURE_MS = 1500;
const RANGE_PAD_CAP = 2;
const RANGE_PAD_DIV = 6;
const MIN_SPAN = 5;
const MIN_HI_OVER_LO = 7;

/**
 * Two-step vocal-range calibration flow. Owns its own rAF loop reading pitch
 * from the shared AudioEngine.
 */
export function useCalibration(engine: AudioEngine, active: boolean): {
  ui: CalibUi;
  capture: () => void;
  reset: () => void;
} {
  const [ui, setUi] = useState<CalibUi>({
    phase: "low",
    cue: "ready",
    liveNote: "—",
    hint: 'Sing your LOWEST comfortable "ah" — not a growl, just easy and low.',
    actionLabel: "Hold, then press to capture LOW",
    status: "",
    statusVariant: "",
    result: "",
    capturing: false,
    lowCaptured: null,
    finishedRange: null,
  });

  const phaseRef = useRef<CalibPhase>("low");
  const capturingRef = useRef(false);
  const samples = useRef<number[]>([]);
  const rafId = useRef<number | null>(null);

  const patch = useCallback((delta: Partial<CalibUi>) => setUi((prev) => ({ ...prev, ...delta })), []);

  const reset = useCallback(() => {
    phaseRef.current = "low";
    capturingRef.current = false;
    samples.current = [];
    patch({
      phase: "low",
      cue: "ready",
      liveNote: "—",
      hint: 'Sing your LOWEST comfortable "ah" — not a growl, just easy and low.',
      actionLabel: "Hold, then press to capture LOW",
      status: "",
      statusVariant: "",
      result: "",
      capturing: false,
      lowCaptured: null,
      finishedRange: null,
    });
  }, [patch]);

  const loop = useCallback(() => {
    if (!active) return;
    const sample = engine.readPitch();
    if (sample.singing && sample.midi != null) {
      patch({ liveNote: midiToName(Math.round(sample.midi)) });
      if (capturingRef.current) samples.current.push(sample.midi);
    } else {
      patch({ liveNote: "—" });
    }
    rafId.current = requestAnimationFrame(loop);
  }, [active, engine, patch]);

  useEffect(() => {
    if (!active) return;
    reset();
    rafId.current = requestAnimationFrame(loop);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      capturingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset intentionally runs once per activation
  }, [active, engine, loop]);

  const finishCalibration = useCallback(
    (lowVal: number, highVal: number) => {
      let lo = lowVal;
      let hi = highVal;
      if (hi < lo) [lo, hi] = [hi, lo];
      // Pull extremes in a touch so training sits in the comfortable middle.
      const pad = Math.min(RANGE_PAD_CAP, Math.floor((hi - lo) / RANGE_PAD_DIV));
      let finalLo = lo + pad;
      let finalHi = hi - pad;
      if (finalHi - finalLo < MIN_SPAN) {
        finalLo = lo;
        finalHi = Math.max(hi, lo + MIN_HI_OVER_LO);
      }
      saveRange({ lo: finalLo, hi: finalHi });
      phaseRef.current = "done";
      patch({
        phase: "done",
        result: `Saved: ${midiToName(finalLo)} – ${midiToName(finalHi)} ✓`,
        status: "",
        statusVariant: "",
        finishedRange: { lo: finalLo, hi: finalHi },
      });
    },
    [patch],
  );

  const capture = useCallback(() => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    samples.current = [];
    patch({
      capturing: true,
      cue: "capturing",
      actionLabel: "Capturing… keep holding",
    });
    window.setTimeout(() => {
      capturingRef.current = false;
      const val = median(samples.current);
      const currentPhase = phaseRef.current;
      if (val == null) {
        patch({
          capturing: false,
          cue: "ready",
          status: "Didn't catch a steady note — try again.",
          statusVariant: "near",
          actionLabel:
            currentPhase === "low" ? "Hold, then press to capture LOW" : "Hold, then press to capture HIGH",
        });
        return;
      }
      if (currentPhase === "low") {
        phaseRef.current = "high";
        patch({
          phase: "high",
          cue: "ready",
          capturing: false,
          lowCaptured: val,
          result: `Low: ${midiToName(val)}`,
          hint: 'Now sing your HIGHEST comfortable "ah" — no straining.',
          status: "Got your low note.",
          statusVariant: "good",
          actionLabel: "Hold, then press to capture HIGH",
        });
      } else if (currentPhase === "high") {
        patch({ capturing: false });
        const low = ui.lowCaptured;
        if (low != null) finishCalibration(low, val);
      }
    }, CAPTURE_MS);
  }, [finishCalibration, patch, ui.lowCaptured]);

  return { ui, capture, reset };
}

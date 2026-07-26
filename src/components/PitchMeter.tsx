 
import { useEffect, useRef } from "react";

import { METER_SPAN_SEMITONES, TRAIL_LENGTH } from "@/lib/constants";
import { midiToName } from "@/lib/music";

interface Props {
  sungMidi: number | null;
  target: number | undefined;
  targets: readonly number[];
  currentIdx: number;
  done: boolean;
  tolCents: number;
  base: number;
  trailRef: () => readonly (number | null)[];
  onFrame: (cb: (dt: number) => void) => () => void;
}

// Reads shadcn CSS variables so the meter theme-matches the app chrome.
function readColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `hsl(${v})` : fallback;
}

/**
 * Canvas-drawn pitch meter with target lines, tolerance band, sung trail, and
 * an edge dot. Ported from the original `drawMeter()`.
 *
 * It doesn't re-render per frame — the parent hook drives it via `onFrame`,
 * and this component redraws imperatively.
 */
export function PitchMeter({
  sungMidi,
  target,
  targets,
  currentIdx,
  done,
  tolCents,
  base,
  trailRef,
  onFrame,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cache the props on a ref so the rAF-driven draw always sees the latest values.
  const propsRef = useRef({ sungMidi, target, targets, currentIdx, done, tolCents, base });
  propsRef.current = { sungMidi, target, targets, currentIdx, done, tolCents, base };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Theme colors from CSS variables.
    const goodStroke = readColor("--good", "hsl(145 66% 52%)");
    const primaryStroke = readColor("--primary", "hsl(217 100% 71%)");
    const nearStroke = readColor("--near", "hsl(42 89% 64%)");
    const mutedText = readColor("--muted-foreground", "hsl(220 15% 65%)");
    const gridStroke = "rgba(255,255,255,0.05)";
    const trailStroke = readColor("--foreground", "hsl(210 40% 96%)");

    const draw = () => {
      const p = propsRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const center = p.done ? p.base : (p.target ?? p.base);
      const span = METER_SPAN_SEMITONES;
      const yFor = (m: number) => h - ((m - (center - span)) / (2 * span)) * h;

      // Semitone gridlines with natural-note labels on the left.
      for (let m = Math.ceil(center - span); m <= center + span; m++) {
        const y = yFor(m);
        ctx.strokeStyle = gridStroke;
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        const nm = midiToName(m);
        if (!nm.includes("#")) {
          ctx.fillStyle = mutedText;
          ctx.font = "11px system-ui";
          ctx.fillText(nm, 6, y + 4);
        }
      }

      if (!p.done) {
        p.targets.forEach((m, i) => {
          const y = yFor(m);
          if (i === p.currentIdx) {
            // Tolerance band around the current target.
            const yHi = yFor(m + p.tolCents / 100);
            const yLo = yFor(m - p.tolCents / 100);
            ctx.fillStyle = "rgba(55,214,122,0.15)";
            ctx.fillRect(40, yHi, w - 40, yLo - yHi);
            ctx.setLineDash([]);
            ctx.strokeStyle = primaryStroke;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(40, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            ctx.fillStyle = primaryStroke;
            ctx.font = "bold 12px system-ui";
            ctx.fillText(`target ${midiToName(m)}`, 46, y - 6);
          } else {
            const past = i < p.currentIdx;
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = past ? "rgba(55,214,122,0.7)" : "rgba(110,168,254,0.4)";
            ctx.lineWidth = past ? 2 : 1.5;
            ctx.beginPath();
            ctx.moveTo(40, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = past ? "rgba(55,214,122,0.8)" : mutedText;
            ctx.font = "11px system-ui";
            ctx.fillText(`${i + 1}. ${midiToName(m)}${past ? " ✓" : ""}`, 46, y - 4);
          }
        });
      }

      // Sung-pitch trail.
      const trail = trailRef();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = trailStroke;
      ctx.beginPath();
      let started = false;
      trail.forEach((m, i) => {
        if (m == null) {
          started = false;
          return;
        }
        const x = 40 + (i / TRAIL_LENGTH) * (w - 40);
        const y = yFor(m);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Current dot.
      if (p.sungMidi != null && p.target !== undefined && !p.done) {
        const x = w - 4;
        const y = yFor(p.sungMidi);
        const near = Math.abs((p.sungMidi - p.target) * 100) <= p.tolCents;
        ctx.fillStyle = near ? goodStroke : nearStroke;
        ctx.beginPath();
        ctx.arc(Math.min(x, w - 6), y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // Draw once, then subscribe to the trainer's rAF ticks for further redraws.
    draw();
    return onFrame(draw);
  }, [onFrame, trailRef]);

  return (
    <div className="relative h-[220px] w-full">
      <canvas ref={canvasRef} className="block size-full rounded-xl border border-border bg-card" />
    </div>
  );
}

import { useEffect, useRef } from "react";

import { METER_RANGE_PAD, TRAIL_LENGTH } from "@/lib/constants";
import { midiToName } from "@/lib/music";

interface Props {
  sungMidi: number | null;
  target: number | undefined;
  targets: readonly number[];
  currentIdx: number;
  done: boolean;
  tolCents: number;
  loMidi: number;
  hiMidi: number;
  covered: readonly number[];
  theme: "light" | "dark";
  trailRef: () => readonly (number | null)[];
  onFrame: (cb: (dt: number) => void) => () => void;
}

function cssHsl(varName: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `hsl(${v})`;
}
function cssHslA(varName: string, alpha: number): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `hsl(${v} / ${alpha})`;
}

const LEFT_GUTTER = 44;
// Coverage dot sits in the gutter, just left of the note label.
const COVERAGE_DOT_X = 34;
const COVERAGE_DOT_R = 3;

/**
 * Canvas pitch meter: the hero of the trainer. Draws target lines, a tolerance
 * band, the sung-pitch trail, and an edge needle+dot. Redraws imperatively on
 * every animation frame (driven by the trainer's rAF loop), and re-reads theme
 * colors whenever `theme` flips.
 */
export function PitchMeter({
  sungMidi,
  target,
  targets,
  currentIdx,
  done,
  tolCents,
  loMidi,
  hiMidi,
  covered,
  theme,
  trailRef,
  onFrame,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ sungMidi, target, targets, currentIdx, done, tolCents, loMidi, hiMidi, covered });
  propsRef.current = { sungMidi, target, targets, currentIdx, done, tolCents, loMidi, hiMidi, covered };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Theme colors — re-read when `theme` changes (this effect re-runs).
    const col = {
      good: cssHsl("--good"),
      goodBand: cssHslA("--good", 0.16),
      primary: cssHsl("--primary"),
      near: cssHsl("--near"),
      muted: cssHsl("--muted-foreground"),
      grid: cssHsl("--meter-grid"),
      trail: cssHsl("--foreground"),
      pastLine: cssHslA("--good", 0.6),
      upLine: cssHslA("--primary", 0.35),
      coveredDot: cssHsl("--good"),
      uncoveredDot: cssHslA("--muted-foreground", 0.4),
    };

    const draw = () => {
      const p = propsRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Fixed axis over the whole vocal range (with a little padding), so every
      // note sits at a stable spot and you can see the full range at once —
      // rather than a window that scrolls to follow the current target.
      const axisLo = p.loMidi - METER_RANGE_PAD;
      const axisHi = p.hiMidi + METER_RANGE_PAD;
      const axisSpan = Math.max(1, axisHi - axisLo);
      const yFor = (m: number) => h - ((m - axisLo) / axisSpan) * h;

      // Semitone gridlines; label naturals on the left. A coverage dot in the
      // gutter marks every note you've already trained (green) vs not yet (gray).
      const coveredSet = new Set(p.covered);
      ctx.lineWidth = 1;
      for (let m = axisLo; m <= axisHi; m++) {
        const y = yFor(m);
        ctx.strokeStyle = col.grid;
        ctx.globalAlpha = m % 12 === 0 ? 0.9 : 0.4;
        ctx.beginPath();
        ctx.moveTo(LEFT_GUTTER, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const nm = midiToName(m);
        if (!nm.includes("#")) {
          ctx.fillStyle = col.muted;
          ctx.font = "500 11px 'Inter Variable', system-ui";
          ctx.fillText(nm, 8, y + 4);
        }
        const isCovered = coveredSet.has(m);
        ctx.fillStyle = isCovered ? col.coveredDot : col.uncoveredDot;
        ctx.beginPath();
        ctx.arc(COVERAGE_DOT_X, y, COVERAGE_DOT_R, 0, Math.PI * 2);
        if (isCovered) {
          ctx.fill();
        } else {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = col.uncoveredDot;
          ctx.stroke();
        }
      }

      if (!p.done) {
        p.targets.forEach((m, i) => {
          const y = yFor(m);
          if (i === p.currentIdx) {
            const yHi = yFor(m + p.tolCents / 100);
            const yLo = yFor(m - p.tolCents / 100);
            ctx.fillStyle = col.goodBand;
            ctx.fillRect(LEFT_GUTTER, yHi, w - LEFT_GUTTER, yLo - yHi);
            ctx.setLineDash([]);
            ctx.strokeStyle = col.primary;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(LEFT_GUTTER, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            ctx.fillStyle = col.primary;
            ctx.font = "700 12px 'Inter Variable', system-ui";
            ctx.fillText(`target ${midiToName(m)}`, LEFT_GUTTER + 6, y - 7);
          } else {
            const past = i < p.currentIdx;
            ctx.setLineDash([4, 6]);
            ctx.strokeStyle = past ? col.pastLine : col.upLine;
            ctx.lineWidth = past ? 2 : 1.5;
            ctx.beginPath();
            ctx.moveTo(LEFT_GUTTER, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = past ? col.pastLine : col.muted;
            ctx.font = "500 11px 'Inter Variable', system-ui";
            ctx.fillText(`${i + 1}. ${midiToName(m)}${past ? " ✓" : ""}`, LEFT_GUTTER + 6, y - 5);
          }
        });
      }

      // Sung-pitch trail.
      const trail = trailRef();
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = col.trail;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      let started = false;
      trail.forEach((m, i) => {
        if (m == null) {
          started = false;
          return;
        }
        const x = LEFT_GUTTER + (i / TRAIL_LENGTH) * (w - LEFT_GUTTER);
        const y = yFor(m);
        if (started) {
          ctx.lineTo(x, y);
        } else {
          ctx.moveTo(x, y);
          started = true;
        }
      });
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Current needle + dot at the right edge.
      if (p.sungMidi != null && p.target !== undefined && !p.done) {
        const y = yFor(p.sungMidi);
        const near = Math.abs((p.sungMidi - p.target) * 100) <= p.tolCents;
        const color = near ? col.good : col.near;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(LEFT_GUTTER, y);
        ctx.lineTo(w - 8, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(w - 10, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
    return onFrame(draw);
  }, [onFrame, trailRef, theme]);

  return (
    <div className="relative size-full">
      <canvas ref={canvasRef} className="block size-full rounded-2xl border border-border bg-meter-surface" />
    </div>
  );
}

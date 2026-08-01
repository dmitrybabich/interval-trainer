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

// Always-present room (semitones) beyond the current target, so a target sitting
// at your range floor/ceiling still has visible space to show a flat/sharp
// attempt — before the reactive voice expansion below even needs to kick in.
const SING_HEADROOM = 5;

// Soft cushion at the very edges, as a fraction of the axis span, so the sung dot
// never kisses the border even when you're right at the current extreme.
const AXIS_EDGE_PAD = 0.1;

// How far past your calibrated range the axis will stretch to follow your voice.
// Pitch detection throws occasional octave-error / noise blips; a reading more
// than this far outside your range is an artifact, not singing, so we clamp it —
// otherwise a single junk sample yanks the whole axis open for a few frames.
const VOICE_EXPAND_LIMIT = 7;

/**
 * Vertical axis bounds. Starts from the calibrated range (padded), then:
 *  - reserves SING_HEADROOM below the lowest / above the highest target, so an
 *    edge target isn't jammed against the border with nowhere to sing wrong;
 *  - expands to include the live pitch and the whole trail, so anything you sing
 *    stays on screen;
 *  - adds a 10% cushion at both edges so the dot never rides the border.
 * Never shrinks below the full range.
 */
function axisBounds(
  loMidi: number,
  hiMidi: number,
  targets: readonly number[],
  sungMidi: number | null,
  trail: readonly (number | null)[],
) {
  // Voice can push the axis out, but only within VOICE_EXPAND_LIMIT of the range —
  // beyond that the reading is an octave-error/noise blip, not real singing, and
  // shouldn't be allowed to yank the axis wide.
  const voiceFloor = loMidi - VOICE_EXPAND_LIMIT;
  const voiceCeil = hiMidi + VOICE_EXPAND_LIMIT;
  let voiceLo = Infinity;
  let voiceHi = -Infinity;
  const consider = (m: number | null) => {
    if (m == null || m < voiceFloor || m > voiceCeil) return;
    if (m < voiceLo) voiceLo = m;
    if (m > voiceHi) voiceHi = m;
  };
  consider(sungMidi);
  for (const m of trail) consider(m);

  const targetLo = targets.length ? Math.min(...targets) - SING_HEADROOM : Infinity;
  const targetHi = targets.length ? Math.max(...targets) + SING_HEADROOM : -Infinity;
  const baseLo = Math.min(loMidi, targetLo, Math.floor(voiceLo)) - METER_RANGE_PAD;
  const baseHi = Math.max(hiMidi, targetHi, Math.ceil(voiceHi)) + METER_RANGE_PAD;
  const cushion = (baseHi - baseLo) * AXIS_EDGE_PAD;
  const lo = baseLo - cushion;
  const hi = baseHi + cushion;
  return { lo, hi, span: Math.max(1, hi - lo) };
}

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

      // Axis spans the calibrated range, expanded to keep your voice on screen
      // even when it dips below the floor or above the ceiling (see axisBounds).
      const { lo: axisLo, span: axisSpan } = axisBounds(p.loMidi, p.hiMidi, p.targets, p.sungMidi, trailRef());
      const axisHi = axisLo + axisSpan;
      const yFor = (m: number) => h - ((m - axisLo) / axisSpan) * h;

      // Semitone gridlines at integer MIDI notes (axis bounds are fractional
      // after the edge cushion, so round inward). Label naturals on the left; a
      // coverage dot in the gutter marks trained (green) vs untrained (gray).
      const coveredSet = new Set(p.covered);
      ctx.lineWidth = 1;
      for (let m = Math.ceil(axisLo); m <= Math.floor(axisHi); m++) {
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

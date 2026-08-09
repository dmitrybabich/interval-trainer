import { useEffect, useRef } from "react";

import { DETECTOR_FADE_S, DETECTOR_REF_FADE_S, type Dwell, type KeyRef, type PitchPoint } from "@/hooks/useDetector";
import { midiToName } from "@/lib/music";

interface Props {
  theme: "light" | "dark";
  loMidi: number;
  hiMidi: number;
  trailRef: () => readonly PitchPoint[];
  dwellsRef: () => readonly Dwell[];
  liveRef: () => Dwell | null;
  refsRef: () => readonly KeyRef[];
  clockRef: () => number;
  onFrame: (cb: () => void) => () => void;
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
// Seconds of history visible across the width. Playhead sits near the right, so
// the roll reads as "now" scrolling left into the past.
const WINDOW_S = 6;
const PLAYHEAD_FRAC = 0.92;
// Semitones of air above/below your range so bars never ride the border.
const PITCH_PAD = 2;
// How fast the axis eases open when you sing past it (per frame). Only ever
// grows, so this smooths the expansion without ever snapping back.
const AXIS_EASE = 0.12;

interface Scene {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  playX: number;
  axisLo: number;
  axisHi: number;
  axisSpan: number;
  winStart: number;
  winEnd: number;
  now: number;
  yFor: (m: number) => number;
  xFor: (t: number) => number;
  col: Record<string, string>;
}

function drawGrid(sc: Scene): void {
  const { ctx, w, col } = sc;
  ctx.lineWidth = 1;
  for (let m = Math.ceil(sc.axisLo); m <= Math.floor(sc.axisHi); m++) {
    const y = sc.yFor(m);
    ctx.strokeStyle = col.grid;
    ctx.globalAlpha = m % 12 === 0 ? 0.9 : 0.4;
    ctx.beginPath();
    ctx.moveTo(LEFT_GUTTER, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const nm = midiToName(m);
    if (nm.includes("#")) continue;
    ctx.fillStyle = col.muted;
    ctx.font = "500 11px 'Inter Variable', system-ui";
    ctx.fillText(nm, 8, y + 4);
  }
}

// Piano keys you played: each drops a dashed guide line at its pitch, running
// from the moment you pressed it rightward to the playhead — the target to sing
// up/down to meet. Fades with age. A note tag sits at the leading edge.
function drawRefs(sc: Scene, refs: readonly KeyRef[]): void {
  const { ctx, col } = sc;
  for (const r of refs) {
    const age = sc.now - r.startT;
    const fade = Math.max(0, 1 - age / DETECTOR_REF_FADE_S);
    if (fade <= 0) continue;
    const y = sc.yFor(r.midi);
    const x0 = Math.max(LEFT_GUTTER, sc.xFor(r.startT));

    ctx.strokeStyle = col.ref;
    ctx.globalAlpha = fade;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(sc.playX, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = col.ref;
    ctx.font = "600 11px 'Inter Variable', system-ui";
    ctx.fillText(midiToName(r.midi), x0 + 3, y - 4);
  }
  ctx.globalAlpha = 1;
}

// The notes you stayed on: each dwell is a bar at its held pitch, spanning the
// time you held it. It fades as it ages (the "disappears over time" memory) and
// the longer you held it the taller and more opaque it draws — so a note you
// really sat on stands out from one you brushed past.
function drawDwells(sc: Scene, dwells: readonly Dwell[], live: Dwell | null): void {
  const { ctx, col } = sc;
  const all = live ? [...dwells, live] : dwells;
  for (const d of all) {
    if (d.endT < sc.winStart || d.startT > sc.winEnd) continue;
    const held = d.endT - d.startT;
    const age = sc.now - d.endT;
    const fade = live && d === live ? 1 : Math.max(0, 1 - age / DETECTOR_FADE_S);
    if (fade <= 0) continue;

    // Longer holds read as more committed: taller bar, stronger fill.
    const heightScale = Math.min(1, 0.45 + held * 0.5);
    const barH = Math.max(4, (sc.h / sc.axisSpan) * 0.82 * heightScale);
    const x0 = sc.xFor(d.startT);
    const x1 = sc.xFor(d.endT);
    const y = sc.yFor(d.centerMidi);

    ctx.globalAlpha = fade * (0.25 + 0.55 * heightScale);
    ctx.fillStyle = col.dwell;
    ctx.beginPath();
    ctx.roundRect(x0, y - barH / 2, Math.max(3, x1 - x0), barH, 3);
    ctx.fill();

    // Name-tag the note while it's still fresh enough to read.
    if (fade > 0.35 && held > 0.3) {
      ctx.globalAlpha = fade;
      ctx.fillStyle = col.dwellText;
      ctx.font = "600 11px 'Inter Variable', system-ui";
      ctx.fillText(midiToName(d.note), x0 + 3, y - barH / 2 - 3);
    }
  }
  ctx.globalAlpha = 1;
}

function drawTrail(sc: Scene, trail: readonly PitchPoint[]): void {
  const { ctx, col } = sc;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = col.trail;
  ctx.globalAlpha = 0.9;
  let prev: { x: number; y: number } | null = null;
  for (const p of trail) {
    if (p.midi == null || p.t < sc.winStart || p.t > sc.winEnd) {
      prev = null;
      continue;
    }
    const pt = { x: sc.xFor(p.t), y: sc.yFor(p.midi) };
    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    prev = pt;
  }
  ctx.globalAlpha = 1;
}

function drawLiveDot(sc: Scene, trail: readonly PitchPoint[]): void {
  const latest = trail.at(-1);
  if (latest?.midi == null) return;
  const { ctx, col } = sc;
  const y = sc.yFor(latest.midi);
  ctx.strokeStyle = col.trail;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(LEFT_GUTTER, y);
  ctx.lineTo(sc.w, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = col.trail;
  ctx.beginPath();
  ctx.arc(sc.playX, y, 6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Freeform pitch roll: X is time scrolling right-to-left past a fixed playhead
 * (driven by the engine clock, not a track), Y is pitch on an axis that starts
 * pinned to your vocal range and only ever grows — sing past it and it eases
 * open to keep you in view, never shrinking back so it can't jump around.
 * Sustained notes render as fading bars — the ones you held longest stay boldest
 * — while the raw sung pitch draws as a live trail on top. Redraws every frame.
 */
export function DetectorRoll({ theme, loMidi, hiMidi, trailRef, dwellsRef, liveRef, refsRef, clockRef, onFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rangeRef = useRef({ loMidi, hiMidi });
  rangeRef.current = { loMidi, hiMidi };
  // The live axis, ratcheted open past the base range as you sing beyond it.
  // Reset whenever the base range prop changes (e.g. recalibration).
  const axisRef = useRef({ lo: loMidi - PITCH_PAD, hi: hiMidi + PITCH_PAD });
  useEffect(() => {
    axisRef.current = { lo: loMidi - PITCH_PAD, hi: hiMidi + PITCH_PAD };
  }, [loMidi, hiMidi]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const col = {
      dwell: cssHsl("--primary"),
      dwellText: cssHsl("--muted-foreground"),
      grid: cssHsl("--meter-grid"),
      muted: cssHsl("--muted-foreground"),
      trail: cssHsl("--foreground"),
      ref: cssHsl("--good"),
      playhead: cssHslA("--primary", 0.5),
    };

    const draw = () => {
      const now = clockRef();
      const trail = trailRef();
      const dwells = dwellsRef();
      const live = liveRef();
      const refs = refsRef();

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const playX = LEFT_GUTTER + (w - LEFT_GUTTER) * PLAYHEAD_FRAC;
      const winStart = now - WINDOW_S * PLAYHEAD_FRAC;
      const winEnd = now + WINDOW_S * (1 - PLAYHEAD_FRAC);

      // Axis starts at your range and ratchets open past it: track the extreme
      // pitches currently on screen, and if any sit beyond the axis, ease the
      // bounds out to include them (with air). Bounds never contract, so the
      // view stays steady once expanded.
      const r = rangeRef.current;
      const ax = axisRef.current;
      let sungLo = Infinity;
      let sungHi = -Infinity;
      for (const p of trail) {
        if (p.midi == null || p.t < winStart) continue;
        sungLo = Math.min(sungLo, p.midi);
        sungHi = Math.max(sungHi, p.midi);
      }
      // Played keys open the axis too, so a reference outside your range shows.
      // Their line runs to the playhead, so any unfaded ref is on-screen.
      for (const rf of refs) {
        if (now - rf.startT > DETECTOR_REF_FADE_S) continue;
        sungLo = Math.min(sungLo, rf.midi);
        sungHi = Math.max(sungHi, rf.midi);
      }
      const tgtLo = Math.min(r.loMidi - PITCH_PAD, Number.isFinite(sungLo) ? sungLo - PITCH_PAD : Infinity);
      const tgtHi = Math.max(r.hiMidi + PITCH_PAD, Number.isFinite(sungHi) ? sungHi + PITCH_PAD : -Infinity);
      if (tgtLo < ax.lo) ax.lo += (tgtLo - ax.lo) * AXIS_EASE;
      if (tgtHi > ax.hi) ax.hi += (tgtHi - ax.hi) * AXIS_EASE;

      const axisLo = ax.lo;
      const axisHi = ax.hi;
      const axisSpan = Math.max(1, axisHi - axisLo);
      const pxPerS = (w - LEFT_GUTTER) / WINDOW_S;
      const sc: Scene = {
        ctx,
        w,
        h,
        playX,
        axisLo,
        axisHi,
        axisSpan,
        winStart,
        winEnd,
        now,
        yFor: (m) => h - ((m - axisLo) / axisSpan) * h,
        xFor: (t) => playX + (t - now) * pxPerS,
        col,
      };

      drawGrid(sc);
      drawRefs(sc, refs);
      drawDwells(sc, dwells, live);

      ctx.strokeStyle = col.playhead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();

      drawTrail(sc, trail);
      drawLiveDot(sc, trail);
    };

    draw();
    return onFrame(draw);
  }, [onFrame, trailRef, dwellsRef, liveRef, refsRef, clockRef, theme]);

  return (
    <div className="relative size-full">
      <canvas ref={canvasRef} className="block size-full rounded-2xl border border-border bg-meter-surface" />
    </div>
  );
}

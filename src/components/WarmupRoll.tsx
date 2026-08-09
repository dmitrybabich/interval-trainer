import { useEffect, useRef } from "react";

import type { VoiceSample } from "@/hooks/useWarmup";
import { midiToName } from "@/lib/music";

export interface RefNote {
  t: number;
  midi: number;
  dur: number;
}

interface Props {
  notes: readonly RefNote[];
  loMidi: number;
  hiMidi: number;
  tolCents: number;
  theme: "light" | "dark";
  trailRef: () => readonly VoiceSample[];
  currentTimeRef: () => number;
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
// Seconds of the track visible across the canvas width. The playhead sits a third
// of the way in, so you see what's coming with a little already-sung tail behind.
const WINDOW_S = 6;
const PLAYHEAD_FRAC = 0.33;
// Extra semitones of vertical air above/below the note range so bars and the
// voice trail never ride the border.
const PITCH_PAD = 2;

// Is a voice sample within tolerance of a reference note sounding at that instant?
function isHit(sample: VoiceSample, notes: readonly RefNote[], tolCents: number): boolean {
  if (sample.midi == null) return false;
  for (const n of notes) {
    if (sample.t < n.t || sample.t > n.t + n.dur) continue;
    if (Math.abs((sample.midi - n.midi) * 100) <= tolCents) return true;
  }
  return false;
}

// Did the voice land on this reference note within tolerance at any point during
// its span? Drives the bar's green "you sang it" fill.
function noteWasHit(note: RefNote, trail: readonly VoiceSample[], tolCents: number): boolean {
  return trail.some(
    (s) => s.midi != null && s.t >= note.t && s.t <= note.t + note.dur && Math.abs((s.midi - note.midi) * 100) <= tolCents,
  );
}

// Shared geometry + palette for the per-frame draw helpers.
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

function drawBars(sc: Scene, notes: readonly RefNote[], trail: readonly VoiceSample[], tolCents: number): void {
  const { ctx, col } = sc;
  const barH = Math.max(3, (sc.h / sc.axisSpan) * 0.7);
  for (const n of notes) {
    if (n.t + n.dur < sc.winStart || n.t > sc.winEnd) continue;
    const x0 = sc.xFor(n.t);
    const x1 = sc.xFor(n.t + n.dur);
    const y = sc.yFor(n.midi);
    ctx.fillStyle = noteWasHit(n, trail, tolCents) ? col.goodBar : col.bar;
    ctx.beginPath();
    ctx.roundRect(x0, y - barH / 2, Math.max(2, x1 - x0), barH, 3);
    ctx.fill();
  }
}

// The live current-pitch needle + dot pinned at the playhead — the always-on
// "here's you right now" indicator, drawn even while the track is paused (the
// scrolling trail only exists while audio.currentTime advances). Green when the
// newest sung sample sits on a reference note within tolerance.
function drawLiveDot(sc: Scene, notes: readonly RefNote[], trail: readonly VoiceSample[], tolCents: number): void {
  const latest = trail.at(-1);
  if (latest?.midi == null) return;
  const { ctx, col } = sc;
  const y = sc.yFor(latest.midi);
  const on = isHit(latest, notes, tolCents);
  const color = on ? col.good : col.trail;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(LEFT_GUTTER, y);
  ctx.lineTo(sc.w, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sc.playX, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrail(sc: Scene, notes: readonly RefNote[], trail: readonly VoiceSample[], tolCents: number): void {
  const { ctx, col } = sc;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  let prev: { x: number; y: number } | null = null;
  for (const s of trail) {
    if (s.midi == null || s.t < sc.winStart || s.t > sc.winEnd) {
      prev = null;
      continue;
    }
    const pt = { x: sc.xFor(s.t), y: sc.yFor(s.midi) };
    if (prev) {
      ctx.strokeStyle = isHit(s, notes, tolCents) ? col.good : col.trail;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    prev = pt;
  }
  ctx.globalAlpha = 1;
}

/**
 * Scrolling piano-roll for the warm-up. X is time (scrolls right-to-left past a
 * fixed playhead driven by audio.currentTime); Y is pitch. Reference notes are
 * horizontal bars — green once the voice has landed on them within tolerance,
 * neutral otherwise. The live sung pitch draws as a trail on top. No scoring,
 * no targets: just "here's the line, here's you." Redraws every animation frame.
 */
export function WarmupRoll({ notes, loMidi, hiMidi, tolCents, theme, trailRef, currentTimeRef, onFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ notes, loMidi, hiMidi, tolCents });
  propsRef.current = { notes, loMidi, hiMidi, tolCents };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const col = {
      good: cssHsl("--good"),
      goodBar: cssHslA("--good", 0.85),
      bar: cssHslA("--muted-foreground", 0.35),
      grid: cssHsl("--meter-grid"),
      muted: cssHsl("--muted-foreground"),
      trail: cssHsl("--foreground"),
      playhead: cssHslA("--primary", 0.7),
    };

    const draw = () => {
      const p = propsRef.current;
      const now = currentTimeRef();
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const axisLo = p.loMidi - PITCH_PAD;
      const axisHi = p.hiMidi + PITCH_PAD;
      const axisSpan = Math.max(1, axisHi - axisLo);
      const playX = LEFT_GUTTER + (w - LEFT_GUTTER) * PLAYHEAD_FRAC;
      const pxPerS = (w - LEFT_GUTTER) / WINDOW_S;
      const sc: Scene = {
        ctx,
        w,
        h,
        playX,
        axisLo,
        axisHi,
        axisSpan,
        winStart: now - WINDOW_S * PLAYHEAD_FRAC,
        winEnd: now + WINDOW_S * (1 - PLAYHEAD_FRAC),
        yFor: (m) => h - ((m - axisLo) / axisSpan) * h,
        xFor: (t) => playX + (t - now) * pxPerS,
        col,
      };

      const trail = trailRef();
      drawGrid(sc);
      drawBars(sc, p.notes, trail, p.tolCents);

      ctx.strokeStyle = col.playhead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();

      drawTrail(sc, p.notes, trail, p.tolCents);
      drawLiveDot(sc, p.notes, trail, p.tolCents);
    };

    draw();
    return onFrame(draw);
  }, [onFrame, trailRef, currentTimeRef, theme]);

  return (
    <div className="relative size-full">
      <canvas ref={canvasRef} className="block size-full rounded-2xl border border-border bg-meter-surface" />
    </div>
  );
}

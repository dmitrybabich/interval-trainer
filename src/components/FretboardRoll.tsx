import { useEffect, useRef } from "react";

import type { FretNote } from "@/lib/fretboard";
import { STRING_LABELS } from "@/lib/fretboard";

interface Props {
  notes: readonly FretNote[];
  theme: "light" | "dark";
  currentTimeRef: () => number;
  onFrame: (cb: () => void) => () => void;
}

function cssHsl(varName: string): string {
  return `hsl(${getComputedStyle(document.documentElement).getPropertyValue(varName).trim()})`;
}
function cssHslA(varName: string, alpha: number): string {
  return `hsl(${getComputedStyle(document.documentElement).getPropertyValue(varName).trim()} / ${alpha})`;
}

const LEFT_GUTTER = 28;
const WINDOW_S = 6;
const PLAYHEAD_FRAC = 0.33;
const STRINGS = STRING_LABELS.length;

/**
 * A scrolling guitar-tab strip: one line per string (high e on top, low E on the
 * bottom, as in written tab), each note a box carrying its fret number, scrolling
 * right-to-left past a fixed playhead so you read what's coming. The note under the
 * playhead lights up. Positions come from the movement-minimising fingering, so the
 * shapes stay in one hand area. Redraws every animation frame.
 */
export function FretboardRoll({ notes, theme, currentTimeRef, onFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const col = {
      line: cssHslA("--muted-foreground", 0.3),
      label: cssHsl("--muted-foreground"),
      box: cssHslA("--muted-foreground", 0.25),
      boxText: cssHsl("--foreground"),
      active: cssHsl("--primary"),
      activeText: cssHsl("--primary-foreground"),
      playhead: cssHslA("--primary", 0.7),
    };

    const draw = () => {
      const now = currentTimeRef();
      const list = notesRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const rowGap = h / (STRINGS + 1);
      const yFor = (string: number) => h - rowGap * (string + 1); // low E bottom, high e top
      const playX = LEFT_GUTTER + (w - LEFT_GUTTER) * PLAYHEAD_FRAC;
      const pxPerS = (w - LEFT_GUTTER) / WINDOW_S;
      const xFor = (t: number) => playX + (t - now) * pxPerS;
      const winStart = now - WINDOW_S * PLAYHEAD_FRAC;
      const winEnd = now + WINDOW_S * (1 - PLAYHEAD_FRAC);

      // String lines + gutter labels.
      ctx.font = "600 11px 'Inter Variable', system-ui";
      ctx.textBaseline = "middle";
      for (let s = 0; s < STRINGS; s++) {
        const y = yFor(s);
        ctx.strokeStyle = col.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(LEFT_GUTTER, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = col.label;
        ctx.textAlign = "center";
        ctx.fillText(STRING_LABELS[s] ?? "", LEFT_GUTTER / 2, y);
      }

      // Playhead.
      ctx.strokeStyle = col.playhead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();

      // Note boxes with fret numbers.
      const boxH = Math.min(rowGap * 0.8, 22);
      for (const n of list) {
        if (n.t + n.dur < winStart || n.t > winEnd) continue;
        const x0 = xFor(n.t);
        const x1 = xFor(n.t + n.dur);
        const bw = Math.max(boxH, x1 - x0);
        const y = yFor(n.string);
        const active = now >= n.t && now < n.t + n.dur;
        ctx.fillStyle = active ? col.active : col.box;
        ctx.beginPath();
        ctx.roundRect(x0, y - boxH / 2, bw, boxH, 5);
        ctx.fill();
        ctx.fillStyle = active ? col.activeText : col.boxText;
        ctx.textAlign = "center";
        ctx.fillText(String(n.fret), x0 + Math.min(bw, boxH) / 2, y);
      }
    };

    draw();
    return onFrame(draw);
  }, [onFrame, currentTimeRef, theme]);

  return (
    <div className="relative size-full">
      <canvas ref={canvasRef} className="block size-full rounded-2xl border border-border bg-meter-surface" />
    </div>
  );
}

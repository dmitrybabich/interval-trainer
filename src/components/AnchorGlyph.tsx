// Melody contour for a song anchor: one dot per note, connected in sequence.
// The two notes that form the target interval (anchor.intervalAt) are drawn big
// and bright with a bracket linking them; every other note is a small dim dot.
// So you can see at a glance which jump in the tune to listen for.
//
// When `playToken` changes (parent triggered a replay), a playhead lights each
// note in time with the audio, driven by anchorNoteStartsMs so it stays locked.

import { useEffect, useRef, useState } from "react";

import { type Anchor, anchorNoteStartsMs } from "@/lib/anchors";
import { SEC_PER_BEAT } from "@/lib/constants";

const MS_PER_S = 1000;

interface Props {
  anchor: Anchor;
  playToken?: number; // bump to (re)start the playhead animation
  height?: number;
}

const STEP_X = 16;
const PAD_X = 8;
const PAD_TOP = 10; // room for the bracket above
const PAD_BOTTOM = 5;

export function AnchorGlyph({ anchor, playToken = 0, height = 40 }: Props) {
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (playToken === 0) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const starts = anchorNoteStartsMs(anchor);
    starts.forEach((ms, i) => {
      timers.current.push(window.setTimeout(() => setPlayingIdx(i), ms));
    });
    // Clear the highlight after the last note's nominal duration.
    const last = anchor.notes.at(-1);
    const lastMs = (starts.at(-1) ?? 0) + (last ? last.beats * SEC_PER_BEAT * MS_PER_S : 0);
    timers.current.push(window.setTimeout(() => setPlayingIdx(null), lastMs));
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [playToken, anchor]);

  const offsets = anchor.notes.map((n) => n.offset);
  if (offsets.length < 2) return null;
  const [aIdx, bIdx] = anchor.intervalAt;
  const min = Math.min(...offsets);
  const max = Math.max(...offsets);
  const span = Math.max(1, max - min);
  const width = PAD_X * 2 + (offsets.length - 1) * STEP_X;
  const xOf = (i: number) => PAD_X + i * STEP_X;
  const yOf = (semis: number) => height - PAD_BOTTOM - ((semis - min) / span) * (height - PAD_TOP - PAD_BOTTOM);

  const ax = xOf(aIdx);
  const bx = xOf(bIdx);
  const bracketY = 4;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Connecting lines. The segment spanning the interval is bright. */}
      {offsets.map((semis, i) => {
        const prev = offsets[i - 1];
        if (prev === undefined) return null;
        const onInterval = i === bIdx && i - 1 === aIdx;
        return (
          <line
            key={`l${i}`}
            x1={xOf(i - 1)}
            y1={yOf(prev)}
            x2={xOf(i)}
            y2={yOf(semis)}
            stroke="hsl(var(--primary))"
            strokeWidth={onInterval ? 2 : 1.25}
            opacity={onInterval ? 0.9 : 0.3}
          />
        );
      })}

      {/* Bracket spanning exactly the two interval notes. */}
      <path
        d={`M ${ax} ${bracketY + 4} L ${ax} ${bracketY} L ${bx} ${bracketY} L ${bx} ${bracketY + 4}`}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {offsets.map((semis, i) => {
        const isInterval = i === aIdx || i === bIdx;
        const isPlaying = i === playingIdx;
        const x = xOf(i);
        const y = yOf(semis);
        return (
          <g key={`n${i}`}>
            {/* Halo on the currently sounding note. */}
            {isPlaying && <circle cx={x} cy={y} r={7} fill="hsl(var(--good))" opacity={0.3} />}
            {isInterval ? (
              <path
                // diamond marker for the two interval notes
                d={`M ${x} ${y - 4} L ${x + 4} ${y} L ${x} ${y + 4} L ${x - 4} ${y} Z`}
                fill={isPlaying ? "hsl(var(--good))" : "hsl(var(--primary))"}
              />
            ) : (
              <circle
                cx={x}
                cy={y}
                r={isPlaying ? 3 : 2}
                fill={isPlaying ? "hsl(var(--good))" : "hsl(var(--muted-foreground))"}
                opacity={isPlaying ? 1 : 0.4}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

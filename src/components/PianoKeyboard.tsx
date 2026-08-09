import type { ReactNode } from "react";
import { useMemo } from "react";

import type { Piano } from "@/hooks/usePiano";
import { KEY_BY_OFFSET } from "@/hooks/usePiano";
import { midiToName, NOTE_NAMES } from "@/lib/music";
import { cn } from "@/lib/utils";

interface Props {
  piano: Piano;
}

function isBlack(midi: number): boolean {
  return NOTE_NAMES[((midi % 12) + 12) % 12].includes("#");
}

// A keyboard-key badge for the shortcut hint. Dark variant sits on black keys.
function Keycap({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded border px-1 text-xs font-semibold uppercase leading-none shadow-sm",
        dark ? "border-white/25 bg-white/15 text-white" : "border-neutral-300 bg-neutral-100 text-neutral-600",
      )}
    >
      {children}
    </kbd>
  );
}

interface KeyInfo {
  midi: number;
  black: boolean;
  label: string | null; // computer-key hint, only for the selected octave
}

/**
 * The visible piano. It renders whatever MIDI span the shared piano exposes —
 * one octave or the full vocal range, per the view toggle — so this component
 * has no view logic of its own. White keys lay out in a row; black keys straddle
 * the gaps (absolute-positioned by their white neighbour) so it stays a real
 * keyboard at any width. Shortcut letters mark the selected octave.
 */
export function PianoKeyboard({ piano }: Props) {
  const { keyOctave, loMidi, hiMidi, active, press } = piano;

  const keys = useMemo<readonly KeyInfo[]>(() => {
    const base = (keyOctave + 1) * 12; // MIDI of the selected octave's C
    const out: KeyInfo[] = [];
    for (let m = loMidi; m <= hiMidi; m++) {
      out.push({ midi: m, black: isBlack(m), label: KEY_BY_OFFSET[m - base] ?? null });
    }
    return out;
  }, [loMidi, hiMidi, keyOctave]);

  const whiteCount = keys.filter((kb) => !kb.black).length;
  const whiteW = 100 / Math.max(1, whiteCount);
  let whiteSeen = 0;

  return (
    <div className="relative h-36 select-none overflow-hidden rounded-lg sm:h-40">
      {keys.map((kb) => {
        if (kb.black) {
          const left = (whiteSeen / whiteCount) * 100;
          return (
            <button
              key={kb.midi}
              onPointerDown={(e) => {
                e.preventDefault();
                press(kb.midi);
              }}
              style={{ left: `calc(${left}% - ${whiteW * 0.3}%)`, width: `${whiteW * 0.6}%` }}
              className={cn(
                "absolute top-0 z-10 flex h-[62%] flex-col items-center justify-end gap-1 rounded-b-lg border border-black/60 bg-neutral-800 pb-2 shadow-md",
                active.has(kb.midi) && "bg-primary",
              )}
            >
              {kb.label && <Keycap dark>{kb.label}</Keycap>}
            </button>
          );
        }
        const style = { left: `${whiteSeen * whiteW}%`, width: `${whiteW}%` };
        whiteSeen += 1;
        return (
          <button
            key={kb.midi}
            onPointerDown={(e) => {
              e.preventDefault();
              press(kb.midi);
            }}
            style={style}
            className={cn(
              "absolute bottom-0 top-0 flex flex-col items-center justify-end gap-1 rounded-b-lg border border-border bg-white pb-2",
              active.has(kb.midi) && "bg-primary",
            )}
          >
            {kb.label && <Keycap>{kb.label}</Keycap>}
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                active.has(kb.midi) ? "text-primary-foreground" : "text-neutral-400",
              )}
            >
              {midiToName(kb.midi)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

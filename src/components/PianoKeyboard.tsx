import { Dice5, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { midiToName, NOTE_NAMES, randInt } from "@/lib/music";
import { loadKeyOctave, saveKeyOctave } from "@/lib/persistence";
import { cn } from "@/lib/utils";

interface Props {
  loMidi: number;
  hiMidi: number;
  onPlay: (midi: number) => void;
}

// Computer-key layout, keyed by semitone offset above the selected octave's C.
// Home row a s d f g h j = the naturals C..B; the row above w e t y u = the
// sharps; k l ; spill into the next octave's C D E. This is the single source of
// truth for both rendering and typing, so the letters are identical for every
// octave — "a" is always the selected octave's C, whichever octave that is.
const KEY_BY_OFFSET: Record<number, string> = {
  0: "a",
  1: "w",
  2: "s",
  3: "e",
  4: "d",
  5: "f",
  6: "t",
  7: "g",
  8: "y",
  9: "h",
  10: "u",
  11: "j",
  12: "k",
  14: "l",
  16: ";",
};
const OFFSET_BY_KEY: Record<string, number> = Object.fromEntries(
  Object.entries(KEY_BY_OFFSET).map(([offset, letter]) => [letter, Number(offset)]),
);

function isBlack(midi: number): boolean {
  return NOTE_NAMES[((midi % 12) + 12) % 12].includes("#");
}

// A little keyboard-key badge for the shortcut hint, so it reads as "press this
// key" rather than plain text. Dark variant sits on the black piano keys.
function Keycap({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded border px-1 text-xs font-semibold uppercase leading-none shadow-sm",
        dark
          ? "border-white/25 bg-white/15 text-white"
          : "border-neutral-300 bg-neutral-100 text-neutral-600",
      )}
    >
      {children}
    </kbd>
  );
}

function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

interface KeyInfo {
  midi: number;
  black: boolean;
  label: string | null; // computer-key hint, only for the bound octave
}

/**
 * A playable piano spanning [loMidi, hiMidi]. White keys lay out in a row with
 * black keys straddling the gaps (absolute-positioned by their neighbours), so
 * it stays a real keyboard at any width. Tap/click or use the computer keyboard;
 * the row of letters binds to whichever octave you pick, so the full range is
 * reachable without cramming every key onto the home row. Each press calls
 * onPlay(midi) — the page sounds the note and drops a guide line on the roll.
 */
export function PianoKeyboard({ loMidi, hiMidi, onPlay }: Props) {
  const { t } = useTranslation();
  const loOct = octaveOf(loMidi);
  const hiOct = octaveOf(hiMidi);
  // Octave the computer-keyboard letters bind to. Restore the last-used one
  // (clamped to the current range), else start at the range's low C.
  const [keyOctave, setKeyOctaveState] = useState(() => {
    const saved = loadKeyOctave();
    return saved == null ? loOct : Math.min(Math.max(saved, loOct), hiOct);
  });
  const setKeyOctave = useCallback((octave: number) => {
    setKeyOctaveState(octave);
    saveKeyOctave(octave);
  }, []);
  const [active, setActive] = useState<ReadonlySet<number>>(() => new Set());
  const heldKeys = useRef(new Set<string>());
  // The most recent note played by any means (tap, key, or random), so Space can
  // replay it. Kept in a ref — replaying doesn't need to re-render.
  const lastPlayed = useRef<number | null>(null);

  const keys = useMemo<readonly KeyInfo[]>(() => {
    const base = (keyOctave + 1) * 12; // MIDI of the selected octave's C
    const out: KeyInfo[] = [];
    for (let m = loMidi; m <= hiMidi; m++) {
      out.push({ midi: m, black: isBlack(m), label: KEY_BY_OFFSET[m - base] ?? null });
    }
    return out;
  }, [loMidi, hiMidi, keyOctave]);

  // whiteIdx per key, so black keys can be positioned against their left white
  // neighbour and the whole thing scales with the white-key count.
  const whiteCount = keys.filter((kb) => !kb.black).length;

  const flash = useCallback((midi: number) => {
    setActive((cur) => new Set(cur).add(midi));
    window.setTimeout(() => {
      setActive((cur) => {
        const next = new Set(cur);
        next.delete(midi);
        return next;
      });
    }, 140);
  }, []);

  const press = useCallback(
    (midi: number) => {
      lastPlayed.current = midi;
      onPlay(midi);
      flash(midi);
    },
    [onPlay, flash],
  );

  // Play a random note from the selected octave (clamped to the range, so an
  // octave that only partly overlaps still picks a playable note).
  const playRandom = useCallback(() => {
    const base = (keyOctave + 1) * 12;
    const lo = Math.max(loMidi, base);
    const hi = Math.min(hiMidi, base + 11);
    if (lo > hi) return;
    press(randInt(lo, hi));
  }, [keyOctave, loMidi, hiMidi, press]);

  const replayLast = useCallback(() => {
    if (lastPlayed.current != null) press(lastPlayed.current);
  }, [press]);

  // Map a typed letter to a MIDI, using the same offset table as the labels so
  // the two can never drift. Offset is measured from the selected octave's C.
  const midiForKey = useCallback(
    (key: string): number | null => {
      const offset = OFFSET_BY_KEY[key];
      return offset === undefined ? null : (keyOctave + 1) * 12 + offset;
    },
    [keyOctave],
  );

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;

      if (e.key === "/") {
        e.preventDefault();
        playRandom();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        replayLast();
        return;
      }
      const midi = midiForKey(e.key.toLowerCase());
      if (midi == null || midi < loMidi || midi > hiMidi) return;
      if (heldKeys.current.has(e.key)) return;
      heldKeys.current.add(e.key);
      e.preventDefault();
      press(midi);
    };
    const onUp = (e: KeyboardEvent) => heldKeys.current.delete(e.key);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [midiForKey, press, playRandom, replayLast, loMidi, hiMidi]);

  const octaves = useMemo(() => {
    const out: number[] = [];
    for (let o = loOct; o <= hiOct; o++) out.push(o);
    return out;
  }, [loOct, hiOct]);

  const whiteW = 100 / whiteCount;
  let whiteSeen = 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-32 select-none overflow-hidden rounded-lg sm:h-40">
        {keys.map((kb) => {
          if (kb.black) {
            // Sit the black key over the boundary between the white key it
            // follows and the next: at (whiteSeen)/whiteCount from the left.
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

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <button
          onClick={playRandom}
          className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-medium transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Dice5 className="size-3.5" />
          {t("detector.random")}
          <Keycap>/</Keycap>
        </button>
        <button
          onClick={replayLast}
          className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-medium transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Repeat className="size-3.5" />
          {t("detector.replay")}
          <Keycap>space</Keycap>
        </button>

        {octaves.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="ml-2 mr-1">{t("detector.keys")}</span>
            {octaves.map((o) => (
              <button
                key={o}
                onClick={() => setKeyOctave(o)}
                className={cn(
                  "rounded-md border px-2 py-1 tabular-nums transition-colors",
                  o === keyOctave ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50",
                )}
              >
                C{o}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

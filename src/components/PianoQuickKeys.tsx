import { Dice5, Music2, Repeat } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ShortcutKey, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Piano } from "@/hooks/usePiano";
import { PIANO_OCTAVES } from "@/hooks/usePiano";
import { cn } from "@/lib/utils";

interface Props {
  piano: Piano;
}

const ROUND_BTN =
  "pointer-events-auto grid size-12 place-items-center rounded-full border border-border bg-card/85 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:border-primary/60 hover:text-primary active:bg-primary active:text-primary-foreground";

/**
 * Right-edge floating controls over the roll, vertically centred so they fall
 * under the right thumb one-handed: random note, replay-last, and an octave/view
 * button that opens a popup (octave chips + Octave/Range toggle). Tooltips spell
 * out each action and its keyboard shortcut. Keeps these off the bottom row so
 * the piano UI stays uncluttered.
 */
export function PianoQuickKeys({ piano }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-y-0 right-3 z-20 flex flex-col items-end justify-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              piano.playRandom();
            }}
            aria-label={t("detector.random")}
            className={ROUND_BTN}
          >
            <Dice5 className="size-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {t("detector.random")}
          <ShortcutKey>/</ShortcutKey>
          <ShortcutKey>↓</ShortcutKey>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              piano.replayLast();
            }}
            aria-label={t("detector.replay")}
            className={ROUND_BTN}
          >
            <Repeat className="size-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {t("detector.replay")}
          <ShortcutKey>space</ShortcutKey>
          <ShortcutKey>↑</ShortcutKey>
        </TooltipContent>
      </Tooltip>

      <div className="pointer-events-auto relative flex flex-col items-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={t("detector.octave")}
              className={cn(ROUND_BTN, open && "border-primary text-primary")}
            >
              <Music2 className="size-5" />
              <span className="absolute -bottom-1 rounded bg-primary px-1 text-[10px] font-bold tabular-nums leading-tight text-primary-foreground">
                C{piano.keyOctave}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {t("detector.octave")}
            <ShortcutKey>←</ShortcutKey>
            <ShortcutKey>→</ShortcutKey>
          </TooltipContent>
        </Tooltip>

        {open && (
          <div className="absolute bottom-0 right-14 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xl">
            <div className="flex gap-1">
              {PIANO_OCTAVES.map((o) => (
                <button
                  key={o}
                  onClick={() => piano.setKeyOctave(o)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-sm tabular-nums transition-colors",
                    o === piano.keyOctave ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50",
                  )}
                >
                  C{o}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-border p-0.5 text-sm">
              <button
                onClick={() => piano.setView("octave")}
                className={cn("flex-1 rounded px-3 py-1 transition-colors", piano.view === "octave" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {t("detector.octaveOnly")}
              </button>
              <button
                onClick={() => piano.setView("range")}
                className={cn("flex-1 rounded px-3 py-1 transition-colors", piano.view === "range" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {t("detector.fullRange")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

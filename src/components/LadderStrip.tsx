// The tutorial-ladder header: current step, the pattern (song mnemonic for the
// interval ladder, degree chips for the foundation drill), clean-rep progress
// dots, and the climb button. Extracted from TrainerScreen to keep that
// component's complexity in check.

import { ChevronRight, Music2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AnchorGlyph } from "@/components/AnchorGlyph";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TrainerActions, UiSnapshot } from "@/hooks/useTrainer";
import { type Anchor, anchorName } from "@/lib/anchors";
import { midiToName } from "@/lib/music";
import { CLIMB_REPS, type Rung } from "@/lib/rungs";
import { cn } from "@/lib/utils";

interface Props {
  ladderState: NonNullable<UiSnapshot["ladder"]>;
  rung: Rung;
  ladderLength: number;
  tonic: number | undefined; // targets[0] — the key's root, for the foundation label
  currentIdx: number; // which note in the sequence you're on now — lights the chip
  anchor: Anchor | undefined; // the chosen song for this interval
  anchorOptions: readonly Anchor[]; // all songs for this interval (for the picker)
  onChooseAnchor: (key: string) => void;
  replayAnchor: TrainerActions["replayAnchor"];
  climbRung: TrainerActions["climbRung"];
}

// Scale-degree name for a semitone offset from the tonic — the numbers a singer
// counts ("one, three, five"). Only the triad tones appear in the drill.
const DEGREE_LABEL: Record<number, string> = { 0: "1", 4: "3", 7: "5" };

export function LadderStrip({
  ladderState,
  rung,
  ladderLength,
  tonic,
  currentIdx,
  anchor,
  anchorOptions,
  onChooseAnchor,
  replayAnchor,
  climbRung,
}: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const [anchorPlayToken, setAnchorPlayToken] = useState(0);

  const isFoundation = Boolean(rung.degrees);
  const atTop = ladderState.rungIdx >= ladderLength - 1;
  // The foundation drill wraps (last rung → climb the key), so its button never
  // hides; the interval ladder tops out and hides the button on the last rung.
  const showClimb = isFoundation || !atTop;
  const showDots = rung.sing && (isFoundation || !atTop);

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        {/* Step header: number chip · title, with the key on the right for foundation. */}
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
            {ladderState.rungIdx + 1}/{ladderLength}
          </span>
          <span className="truncate text-sm font-semibold">{t(`rungs.${rung.key}.name`)}</span>
          {isFoundation && tonic !== undefined && (
            <span className="ml-auto shrink-0 text-[11px] font-medium text-muted-foreground">
              {t("trainer.keyOf", { note: midiToName(tonic) })}
            </span>
          )}
        </div>

        {/* Degree chips (foundation) — the pattern, shown not narrated. The chip
            for the note you're singing now lights up. */}
        {isFoundation && rung.degrees && (
          <div className="mt-1.5 flex items-center gap-1">
            {rung.degrees.map((d, i) => (
              <span
                key={i}
                className={cn(
                  "grid size-6 place-items-center rounded-md text-xs font-bold tabular-nums transition-colors",
                  i === currentIdx
                    ? "bg-[hsl(var(--good))] text-white"
                    : i < currentIdx
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {DEGREE_LABEL[d] ?? "?"}
              </span>
            ))}
          </div>
        )}

        <div className="mt-1 truncate text-[11px] text-muted-foreground">{t(`rungs.${rung.key}.hint`)}</div>

        {/* Song mnemonic (interval ladder only): tap ▶ to replay the tune; when the
            interval has several, the name is a picker. Choice persists upstream. */}
        {anchor && (
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={() => {
                replayAnchor();
                setAnchorPlayToken((n) => n + 1);
              }}
              title={t("trainer.replayAnchor")}
              className="grid size-6 shrink-0 place-items-center rounded-full border border-primary/40 text-primary transition-colors hover:bg-primary/10"
            >
              <Music2 className="size-3" />
            </button>
            {anchorOptions.length > 1 ? (
              <Select value={anchor.key} onValueChange={onChooseAnchor}>
                <SelectTrigger className="h-6 w-auto max-w-[42vw] gap-1 rounded-full border-primary/40 px-2 py-0 text-[11px] font-medium text-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anchorOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key} className="text-xs">
                      {anchorName(opt, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="truncate text-[11px] font-medium text-primary">{anchorName(anchor, lang)}</span>
            )}
            <AnchorGlyph anchor={anchor} playToken={anchorPlayToken} />
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {/* Clean-rep dots — how many of CLIMB_REPS you've banked on this rung. */}
        {showDots && (
          <div className="flex items-center gap-1">
            {Array.from({ length: CLIMB_REPS }, (_dot, i) => (
              <span
                key={i}
                className={cn(
                  "size-1.5 rounded-full",
                  i < ladderState.rungReps ? "bg-[hsl(var(--good))]" : "bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
        )}
        {showClimb && (
          <Button variant={rung.sing ? "ghost" : "default"} size="sm" onClick={climbRung} className="gap-1">
            {isFoundation && atTop ? t("trainer.climbKey") : t("trainer.climbRung")}
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

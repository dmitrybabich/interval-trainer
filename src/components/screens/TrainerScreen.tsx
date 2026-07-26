 
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Piano, RotateCcw, SkipForward, Volume2 } from "lucide-react";

import { CoverageMap } from "@/components/CoverageMap";
import { PitchMeter } from "@/components/PitchMeter";
import { SequenceDots } from "@/components/SequenceDots";
import { SoundBadge } from "@/components/SoundBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TrainerActions, UiSnapshot } from "@/hooks/useTrainer";
import { LEVELS } from "@/lib/levels";
import { cn } from "@/lib/utils";

interface Props {
  ui: UiSnapshot;
  actions: TrainerActions;
  trailRef: () => readonly (number | null)[];
  onFrame: (cb: (dt: number) => void) => () => void;
}

export function TrainerScreen({ ui, actions, trailRef, onFrame }: Props) {
  const done = ui.idx >= ui.targets.length;
  const target = ui.targets[ui.idx];
  const isSingleNote = LEVELS[ui.levelIdx]?.steps.length === 0;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className="relative overflow-hidden">
        <CardContent className="pt-6">
          {/* Top row: back / mode & direction toggles / start note & replay */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={actions.leaveTrainer} className="gap-1.5">
              <ArrowLeft className="size-4" /> Levels
            </Button>
            <div className="flex gap-1.5">
              <Button
                variant={ui.mode === "ear" ? "secondary" : "ghost"}
                size="sm"
                onClick={actions.toggleMode}
                title="Toggle guided / ear"
                className={cn(ui.mode === "ear" && "border border-[hsl(var(--near))] text-[hsl(var(--near))]")}
              >
                {ui.mode === "ear" ? "🙈 Ear mode" : "👀 Guided"}
              </Button>
              {!isSingleNote && (
                <Button variant="ghost" size="sm" onClick={actions.toggleDirection} title="Flip leap direction">
                  {ui.direction === "down" ? "↓ Down" : "↑ Up"}
                </Button>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={actions.playStartNote} className="gap-1.5">
                <Piano className="size-4" /> Start note
              </Button>
              <Button variant="ghost" size="sm" onClick={actions.replayAll} className="gap-1.5">
                <Volume2 className="size-4" /> Replay all
              </Button>
            </div>
          </div>

          <div className="mb-2 flex justify-center">
            <SoundBadge state={ui.badge} variant="short" />
          </div>

          <SequenceDots targets={ui.targets} idx={ui.idx} />

          <CoverageMap loMidi={ui.loMidi} hiMidi={ui.hiMidi} covered={ui.covered} current={target} />

          {/* Cue banner */}
          <div className="my-1 flex justify-center">
            <motion.div
              animate={ui.cue === "sing" ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={ui.cue === "sing" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold",
                ui.cue === "sing" && "border-[hsl(var(--good))] bg-[hsl(var(--good))] text-[hsl(var(--background))]",
                ui.cue === "listen" && "border-primary text-primary",
                ui.cue === "next" && "border-border text-muted-foreground",
              )}
            >
              {ui.cue === "listen" && (
                <>
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="inline-block size-2.5 rounded-full bg-current"
                  />
                  🎧 Listen — wait for it…
                </>
              )}
              {ui.cue === "sing" && <>🎤 Sing now</>}
              {ui.cue === "next" && <>Nice — next one loading…</>}
            </motion.div>
          </div>

          <div className="text-center text-[42px] font-extrabold tracking-wider">{ui.liveNote}</div>
          <div className="mono min-h-[18px] text-center text-xs text-muted-foreground">{ui.liveCents}</div>

          <div className="my-2">
            <PitchMeter
              sungMidi={ui.sungMidi}
              target={target}
              targets={ui.targets}
              currentIdx={ui.idx}
              done={done}
              tolCents={ui.tolCents}
              base={ui.loMidi + Math.floor((ui.hiMidi - ui.loMidi) / 2)}
              trailRef={trailRef}
              onFrame={onFrame}
            />
          </div>

          <div
            className={cn(
              "min-h-[26px] text-center text-sm",
              ui.statusVariant === "good" && "font-semibold text-[hsl(var(--good))]",
              ui.statusVariant === "near" && "text-[hsl(var(--near))]",
            )}
          >
            {ui.status}
          </div>

          <div className="mt-3 flex justify-center gap-3">
            <Button variant="ghost" onClick={actions.skip}>
              <SkipForward className="mr-1.5 size-4" /> Skip note
            </Button>
            <Button onClick={() => void actions.buildExercise()}>
              <RotateCcw className="mr-1.5 size-4" /> New exercise
            </Button>
          </div>
        </CardContent>

        {/* Success flash */}
        <AnimatePresence>
          {ui.flashKey > 0 && (
            <motion.div
              key={ui.flashKey}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0], scale: [0.6, 1.1, 1.3] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 grid place-items-center text-7xl"
              style={{ background: "radial-gradient(circle at 50% 45%, hsl(var(--good) / 0.35), hsl(var(--good) / 0.05) 70%)" }}
            >
              ✓
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}

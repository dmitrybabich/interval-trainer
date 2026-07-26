import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowUp, Piano, RotateCcw, SkipForward, Volume2 } from "lucide-react";

import { PitchMeter } from "@/components/PitchMeter";
import { SequenceDots } from "@/components/SequenceDots";
import { Button } from "@/components/ui/button";
import type { TrainerActions, UiSnapshot } from "@/hooks/useTrainer";
import { LEVELS } from "@/lib/levels";
import { cn } from "@/lib/utils";

interface Props {
  ui: UiSnapshot;
  actions: TrainerActions;
  theme: "light" | "dark";
  trailRef: () => readonly (number | null)[];
  onFrame: (cb: (dt: number) => void) => () => void;
}

export function TrainerScreen({ ui, actions, theme, trailRef, onFrame }: Props) {
  const done = ui.idx >= ui.targets.length;
  const target = ui.targets[ui.idx];
  const isSingleNote = LEVELS[ui.levelIdx]?.steps.length === 0;
  const levelTitle = LEVELS[ui.levelIdx]?.name.split(" · ").slice(1).join(" · ") ?? "";
  const coveredSet = new Set(ui.covered);
  const totalNotes = ui.hiMidi - ui.loMidi + 1;
  const hitNotes = [...coveredSet].filter((m) => m >= ui.loMidi && m <= ui.hiMidi).length;

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] min-h-[440px] w-full max-w-xl flex-col gap-2">
      {/* Minimal toolbar: back + title on the left, icon actions on the right. */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={actions.leaveTrainer} title="Back to levels" className="text-muted-foreground">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{levelTitle}</div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={actions.playStartNote} title="Play start note" className="text-muted-foreground">
            <Piano className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={actions.replayAll} title="Replay the interval" className="text-muted-foreground">
            <Volume2 className="size-5" />
          </Button>
          {!isSingleNote && (
            <Button
              variant="ghost"
              size="icon"
              onClick={actions.toggleDirection}
              title={ui.direction === "down" ? "Direction: down (tap for up)" : "Direction: up (tap for down)"}
              className="text-muted-foreground"
            >
              {ui.direction === "down" ? <ArrowDown className="size-5" /> : <ArrowUp className="size-5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={actions.skip} title="Skip this note" className="text-muted-foreground">
            <SkipForward className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void actions.buildExercise()} title="New exercise" className="text-primary">
            <RotateCcw className="size-5" />
          </Button>
        </div>
      </div>

      {/* The meter fills all remaining vertical space. Everything else overlays it. */}
      <div className="relative min-h-0 w-full flex-1">
        <PitchMeter
          sungMidi={ui.sungMidi}
          target={target}
          targets={ui.targets}
          currentIdx={ui.idx}
          done={done}
          tolCents={ui.tolCents}
          loMidi={ui.loMidi}
          hiMidi={ui.hiMidi}
          theme={theme}
          trailRef={trailRef}
          onFrame={onFrame}
        />

        {/* Sequence dots, overlaid top-center. */}
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <div className="rounded-full bg-card/70 px-3 py-1 backdrop-blur-sm">
            <SequenceDots targets={ui.targets} idx={ui.idx} />
          </div>
        </div>

        {/* Cue pill, overlaid top-right. */}
        <div className="pointer-events-none absolute right-3 top-3">
          <motion.div
            animate={ui.cue === "sing" ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={ui.cue === "sing" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm",
              ui.cue === "sing" && "border-[hsl(var(--good))] bg-[hsl(var(--good))] text-white",
              ui.cue === "listen" && "border-primary/50 bg-card/70 text-primary",
              ui.cue === "next" && "border-border bg-card/70 text-muted-foreground",
            )}
          >
            {ui.cue === "listen" && (
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="inline-block size-2 rounded-full bg-current"
              />
            )}
            {ui.cue === "listen" ? "Listen" : ui.cue === "sing" ? "Sing now" : "Next…"}
          </motion.div>
        </div>

        {/* Live note readout, overlaid bottom-left. */}
        <div className="pointer-events-none absolute bottom-3 left-4">
          <div className="text-5xl font-extrabold leading-none tracking-tight">{ui.liveNote}</div>
          <div className="mono mt-1 h-4 text-xs text-muted-foreground">{ui.liveCents}</div>
        </div>

        {/* Coverage tally + status, overlaid bottom-right. */}
        <div className="pointer-events-none absolute bottom-3 right-4 flex flex-col items-end gap-1 text-right">
          <div
            className={cn(
              "max-w-[60vw] text-sm",
              ui.statusVariant === "good" && "font-semibold text-[hsl(var(--good))]",
              ui.statusVariant === "near" && "text-[hsl(var(--near))]",
              ui.statusVariant === "" && "text-muted-foreground",
            )}
          >
            {ui.status}
          </div>
          <div className="mono text-[11px] text-muted-foreground">
            {hitNotes >= totalNotes ? (
              <span className="font-semibold text-[hsl(var(--good))]">✓ Whole range covered</span>
            ) : (
              `range ${hitNotes}/${totalNotes}`
            )}
          </div>
        </div>
      </div>

      {/* Success flash overlay */}
      <AnimatePresence>
        {ui.flashKey > 0 && (
          <motion.div
            key={ui.flashKey}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0], scale: [0.6, 1.1, 1.4] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="pointer-events-none fixed inset-0 z-40 grid place-items-center text-8xl"
            style={{ color: "hsl(var(--good))" }}
          >
            ✓
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

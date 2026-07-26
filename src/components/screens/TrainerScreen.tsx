import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Ear, Eye, Piano, RotateCcw, SkipForward, Volume2 } from "lucide-react";

import { CoverageMap } from "@/components/CoverageMap";
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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {/* Header row: back + level title */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={actions.leaveTrainer} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="size-4" /> Levels
        </Button>
        <div className="truncate text-sm font-semibold">{levelTitle}</div>
      </div>

      {/* The meter — the hero. Big note readout floats top-left; cue floats top-right. */}
      <div className="relative h-[300px] w-full sm:h-[340px]">
        <PitchMeter
          sungMidi={ui.sungMidi}
          target={target}
          targets={ui.targets}
          currentIdx={ui.idx}
          done={done}
          tolCents={ui.tolCents}
          base={ui.loMidi + Math.floor((ui.hiMidi - ui.loMidi) / 2)}
          theme={theme}
          trailRef={trailRef}
          onFrame={onFrame}
        />

        {/* Live note readout, overlaid bottom-left of the meter. */}
        <div className="pointer-events-none absolute bottom-3 left-4">
          <div className="text-5xl font-extrabold leading-none tracking-tight">{ui.liveNote}</div>
          <div className="mono mt-1 h-4 text-xs text-muted-foreground">{ui.liveCents}</div>
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
      </div>

      {/* Sequence dots */}
      <SequenceDots targets={ui.targets} idx={ui.idx} />

      {/* Status line */}
      <div
        className={cn(
          "min-h-[24px] text-center text-sm",
          ui.statusVariant === "good" && "font-semibold text-[hsl(var(--good))]",
          ui.statusVariant === "near" && "text-[hsl(var(--near))]",
          ui.statusVariant === "" && "text-muted-foreground",
        )}
      >
        {ui.status}
      </div>

      {/* Primary controls */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="secondary" onClick={actions.playStartNote} className="gap-1.5 rounded-xl">
          <Piano className="size-4" /> Start note
        </Button>
        <Button variant="secondary" onClick={actions.replayAll} className="gap-1.5 rounded-xl">
          <Volume2 className="size-4" /> Replay
        </Button>
        <Button onClick={() => void actions.buildExercise()} className="gap-1.5 rounded-xl">
          <RotateCcw className="size-4" /> New
        </Button>
      </div>

      {/* Secondary controls: mode / direction / skip */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <Button variant="ghost" size="sm" onClick={actions.toggleMode} className="gap-1.5 text-muted-foreground">
          {ui.mode === "ear" ? <Ear className="size-4" /> : <Eye className="size-4" />}
          {ui.mode === "ear" ? "Ear" : "Guided"}
        </Button>
        {!isSingleNote && (
          <Button variant="ghost" size="sm" onClick={actions.toggleDirection} className="text-muted-foreground">
            {ui.direction === "down" ? "↓ Down" : "↑ Up"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={actions.skip} className="gap-1.5 text-muted-foreground">
          <SkipForward className="size-4" /> Skip
        </Button>
      </div>

      {/* Coverage map — quiet, at the bottom. */}
      <CoverageMap loMidi={ui.loMidi} hiMidi={ui.hiMidi} covered={ui.covered} current={target} />

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

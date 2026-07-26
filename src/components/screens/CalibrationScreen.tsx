import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  ui: {
    cue: "ready" | "capturing";
    liveNote: string;
    hint: string;
    actionLabel: string;
    status: string;
    statusVariant: "" | "good" | "near";
    result: string;
    capturing: boolean;
  };
  onCapture: () => void;
  onBack: () => void;
}

export function CalibrationScreen({ ui, onCapture, onBack }: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="size-4" /> Back
            </Button>
            <div className="mono text-sm text-muted-foreground">Set your vocal range</div>
            <Button variant="ghost" size="sm" onClick={onBack}>
              Cancel
            </Button>
          </div>

          <div className="text-center text-[42px] font-extrabold tracking-wider">{ui.liveNote}</div>
          <div className="mono min-h-[18px] text-center text-xs text-muted-foreground">{ui.hint}</div>

          <div className="my-3 flex justify-center">
            <motion.div
              animate={ui.cue === "capturing" ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={
                ui.cue === "capturing" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }
              }
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold",
                ui.cue === "capturing" && "border-[hsl(var(--good))] bg-[hsl(var(--good))] text-[hsl(var(--background))]",
                ui.cue === "ready" && "border-primary text-primary",
              )}
            >
              {ui.cue === "capturing" ? "🎤 Hold it steady…" : "Sing, then press capture"}
            </motion.div>
          </div>

          <div className="mt-3 flex justify-center">
            <Button onClick={onCapture} disabled={ui.capturing}>
              {ui.actionLabel}
            </Button>
          </div>

          {ui.status && (
            <div
              className={cn(
                "mt-2 min-h-[26px] text-center text-sm",
                ui.statusVariant === "good" && "font-semibold text-[hsl(var(--good))]",
                ui.statusVariant === "near" && "text-[hsl(var(--near))]",
              )}
            >
              {ui.status}
            </div>
          )}
          {ui.result && <div className="mono mt-1 text-center text-xs text-muted-foreground">{ui.result}</div>}
        </CardContent>
      </Card>
    </div>
  );
}

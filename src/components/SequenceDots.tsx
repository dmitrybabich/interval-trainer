import { motion } from "framer-motion";

import { midiToName } from "@/lib/music";
import { cn } from "@/lib/utils";

interface Props {
  targets: readonly number[];
  idx: number;
}

export function SequenceDots({ targets, idx }: Props) {
  return (
    <div className="mb-4 mt-2 flex justify-center gap-3">
      {targets.map((m, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <motion.div
            key={`${i}-${m}`}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex min-w-[64px] flex-col items-center gap-1.5"
          >
            <motion.div
              animate={
                current
                  ? { scale: [1, 1.05, 1], boxShadow: "0 0 18px hsl(var(--primary) / 0.4)" }
                  : { scale: 1, boxShadow: "0 0 0 rgba(0,0,0,0)" }
              }
              transition={current ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
              className={cn(
                "grid h-11 w-11 place-items-center rounded-full border-2 text-sm font-bold transition-colors",
                done
                  ? "border-[hsl(var(--good))] bg-[hsl(var(--good)/0.15)] text-[hsl(var(--good))]"
                  : current
                    ? "border-primary bg-card text-foreground"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {midiToName(m)}
            </motion.div>
            <div className="text-[11px] text-muted-foreground">{done ? "✓" : current ? "sing this" : ""}</div>
          </motion.div>
        );
      })}
    </div>
  );
}

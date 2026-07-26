import { motion } from "framer-motion";

import { midiToName } from "@/lib/music";
import { cn } from "@/lib/utils";

interface Props {
  loMidi: number;
  hiMidi: number;
  covered: readonly number[];
  current: number | undefined;
}

export function CoverageMap({ loMidi, hiMidi, covered, current }: Props) {
  const notes: number[] = [];
  for (let m = loMidi; m <= hiMidi; m++) notes.push(m);
  const coveredSet = new Set(covered);
  const hit = notes.filter((m) => coveredSet.has(m)).length;
  const total = notes.length;

  return (
    <div className="my-2">
      <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Range coverage</span>
        <span className="mono">
          {hit >= total ? (
            <span className="font-semibold text-[hsl(var(--good))]">✓ Whole range covered!</span>
          ) : (
            `${hit} / ${total}`
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {notes.map((m) => {
          const done = coveredSet.has(m);
          const isCurrent = m === current;
          return (
            <motion.div
              key={m}
              layout
              className={cn(
                "mono rounded-md border px-1.5 py-0.5 text-[11px] transition-colors",
                done
                  ? "border-[hsl(var(--good))] bg-[hsl(var(--good)/0.12)] text-[hsl(var(--good))] line-through"
                  : isCurrent
                    ? "border-primary text-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {midiToName(m)}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

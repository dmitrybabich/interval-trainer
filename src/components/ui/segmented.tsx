import { motion } from "framer-motion";
import { useId } from "react";

import { cn } from "@/lib/utils";

interface SegmentedProps<V extends string> {
  value: V;
  options: readonly { readonly value: V; readonly label: string }[];
  onValueChange: (v: V) => void;
  className?: string;
}

/** A pill segmented control with an animated selection highlight. */
export function Segmented<V extends string>({ value, options, onValueChange, className }: SegmentedProps<V>) {
  const groupId = useId();
  return (
    <div className={cn("inline-flex rounded-full bg-muted p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onValueChange(o.value)}
            className={cn(
              "relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                className="absolute inset-0 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

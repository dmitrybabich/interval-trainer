import type { SoundBadgeState } from "@/audio/types";
import { Badge } from "@/components/ui/badge";

interface Props {
  state: SoundBadgeState;
  variant?: "full" | "short";
}

const COPY: Record<SoundBadgeState, { full: string; short: string; variant: "good" | "near" | "outline" }> = {
  loading: { full: "⏳ Loading real piano…", short: "⏳ Loading…", variant: "near" },
  real: { full: "🎹 Real piano", short: "🎹 Real piano", variant: "good" },
  synth: { full: "🎛️ Synth (samples unavailable)", short: "🎛️ Synth", variant: "outline" },
};

export function SoundBadge({ state, variant = "full" }: Props) {
  const cfg = COPY[state];
  return <Badge variant={cfg.variant}>{variant === "full" ? cfg.full : cfg.short}</Badge>;
}

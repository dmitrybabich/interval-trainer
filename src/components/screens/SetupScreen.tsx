 
import { motion } from "framer-motion";
import { Play } from "lucide-react";

import type { SoundBadgeState } from "@/audio/types";
import { SoundBadge } from "@/components/SoundBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DIR_OPTIONS,
  GUIDE_OPTIONS,
  HOLD_OPTIONS,
  MODE_OPTIONS,
  type Prefs,
  RANGE_OPTIONS,
  TOL_OPTIONS,
} from "@/lib/constants";
import { LEVELS } from "@/lib/levels";
import { midiToName } from "@/lib/music";

interface Props {
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  savedRange: { lo: number; hi: number } | null;
  soundBadge: SoundBadgeState;
  onStartLevel: (idx: number) => void;
  onCalibrate: () => void;
  status: string;
}

// Individual select field — DRY the label + Radix wiring.
function SelectField<V extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: V;
  options: readonly { readonly value: V; readonly label: string }[];
  onValueChange: (v: V) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onValueChange(v as V)}>
        <SelectTrigger className="min-w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SetupScreen({ prefs, setPref, savedRange, soundBadge, onStartLevel, onCalibrate, status }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <SelectField label="Voice range" value={prefs.range} options={RANGE_OPTIONS} onValueChange={(v) => setPref("range", v)} />
            <SelectField label="Precision" value={prefs.tol} options={TOL_OPTIONS} onValueChange={(v) => setPref("tol", v)} />
            <SelectField label="Hold to confirm" value={prefs.hold} options={HOLD_OPTIONS} onValueChange={(v) => setPref("hold", v)} />
            <SelectField label="Mode" value={prefs.mode} options={MODE_OPTIONS} onValueChange={(v) => setPref("mode", v)} />
            <SelectField label="Direction" value={prefs.direction} options={DIR_OPTIONS} onValueChange={(v) => setPref("direction", v)} />
            <SelectField label="Guide tone" value={prefs.guide} options={GUIDE_OPTIONS} onValueChange={(v) => setPref("guide", v)} />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border bg-card p-3">
            <div>
              <div className="text-xs text-muted-foreground">Your vocal range</div>
              <div className="mt-0.5 font-semibold">
                {savedRange ? `${midiToName(savedRange.lo)} – ${midiToName(savedRange.hi)}` : "Not set yet — using a rough guess"}
              </div>
            </div>
            <Button variant="outline" onClick={onCalibrate}>
              🎚️ Set / update range
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Pick a level to start</div>
            <SoundBadge state={soundBadge} />
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {LEVELS.map((lv, i) => (
              <motion.button
                key={lv.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ scale: 1.003 }}
                whileTap={{ scale: 0.995 }}
                onClick={() => onStartLevel(i)}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary"
              >
                <div className="flex-1">
                  <div className="font-semibold">{lv.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{lv.desc}</div>
                </div>
                <Play className="size-5 text-primary" />
              </motion.button>
            ))}
          </div>

          {status && <div className="mt-3 text-center text-sm text-[hsl(var(--near))]">{status}</div>}
        </CardContent>
      </Card>
    </div>
  );
}

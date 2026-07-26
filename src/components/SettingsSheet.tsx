import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DIR_OPTIONS,
  GUIDE_OPTIONS,
  HOLD_OPTIONS,
  MODE_OPTIONS,
  type Prefs,
  RANGE_OPTIONS,
  TOL_OPTIONS,
} from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 py-4 last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function SelectRow<V extends string>({
  value,
  options,
  onValueChange,
}: {
  value: V;
  options: readonly { readonly value: V; readonly label: string }[];
  onValueChange: (v: V) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as V)}>
      <SelectTrigger className="w-full rounded-xl">
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
  );
}

export function SettingsSheet({ open, onOpenChange, prefs, setPref }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Practice settings</SheetTitle>
          <SheetDescription>Tune difficulty and how the exercise plays. Saved automatically.</SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <Row label="Mode" hint="Guided plays every note; ear gives only the start.">
            <Segmented value={prefs.mode} options={MODE_OPTIONS} onValueChange={(v) => setPref("mode", v)} />
          </Row>
          <Row label="Direction" hint="Which way the interval leaps.">
            <Segmented value={prefs.direction} options={DIR_OPTIONS} onValueChange={(v) => setPref("direction", v)} />
          </Row>
          <Row label="Guide tone" hint="Easy mode: a quiet drone holds note 1 until you land it.">
            <Segmented value={prefs.guide} options={GUIDE_OPTIONS} onValueChange={(v) => setPref("guide", v)} />
          </Row>
          <Row label="Voice range" hint="Where exercises sit if you haven't calibrated.">
            <SelectRow value={prefs.range} options={RANGE_OPTIONS} onValueChange={(v) => setPref("range", v)} />
          </Row>
          <Row label="Precision" hint="How close counts as on-pitch.">
            <SelectRow value={prefs.tol} options={TOL_OPTIONS} onValueChange={(v) => setPref("tol", v)} />
          </Row>
          <Row label="Hold to confirm" hint="How long to hold a single note.">
            <SelectRow value={prefs.hold} options={HOLD_OPTIONS} onValueChange={(v) => setPref("hold", v)} />
          </Row>
        </div>
      </SheetContent>
    </Sheet>
  );
}

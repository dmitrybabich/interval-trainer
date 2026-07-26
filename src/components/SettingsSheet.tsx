import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Theme } from "@/hooks/useTheme";
import {
  DIR_OPTIONS,
  FOUND_HINT_OPTIONS,
  GUIDE_OPTIONS,
  HOLD_OPTIONS,
  MODE_OPTIONS,
  OCTAVE_MODE_OPTIONS,
  type Prefs,
  RANGE_OPTIONS,
  THEME_OPTIONS,
  TOL_OPTIONS,
} from "@/lib/constants";
import { midiToName } from "@/lib/music";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  savedRange: { lo: number; hi: number } | null;
  onCalibrate: () => void;
}

// A titled group of related rows.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-3">
      <h3 className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="overflow-hidden rounded-2xl border">{children}</div>
    </section>
  );
}

// One inline row: label (with optional hint) on the left, control on the right.
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs leading-tight text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
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
      <SelectTrigger className="h-8 w-[168px] rounded-lg text-sm">
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

export function SettingsSheet({
  open,
  onOpenChange,
  prefs,
  setPref,
  theme,
  onThemeChange,
  savedRange,
  onCalibrate,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Tune the exercise and how it plays. Saved automatically.</SheetDescription>
        </SheetHeader>

        <div className="mt-3">
          <Section title="Exercise">
            <Row label="Mode" hint="Guided plays every note; ear gives only the start.">
              <Segmented value={prefs.mode} options={MODE_OPTIONS} onValueChange={(v) => setPref("mode", v)} />
            </Row>
            <Row label="Direction" hint="Which way the interval leaps.">
              <Segmented value={prefs.direction} options={DIR_OPTIONS} onValueChange={(v) => setPref("direction", v)} />
            </Row>
            <Row label="Sweep" hint="One octave at a time, or the whole range.">
              <Segmented value={prefs.octaveMode} options={OCTAVE_MODE_OPTIONS} onValueChange={(v) => setPref("octaveMode", v)} />
            </Row>
          </Section>

          <Section title="Feedback">
            <Row label="Guide tone" hint="A quiet drone holds note 1 until you land it.">
              <Segmented value={prefs.guide} options={GUIDE_OPTIONS} onValueChange={(v) => setPref("guide", v)} />
            </Row>
            <Row label="Found-note chime" hint="Play the note the moment you land on it.">
              <Segmented value={prefs.foundHint} options={FOUND_HINT_OPTIONS} onValueChange={(v) => setPref("foundHint", v)} />
            </Row>
            <Row label="Precision" hint="How close counts as on-pitch.">
              <SelectRow value={prefs.tol} options={TOL_OPTIONS} onValueChange={(v) => setPref("tol", v)} />
            </Row>
            <Row label="Hold to confirm" hint="How long to hold a single note.">
              <SelectRow value={prefs.hold} options={HOLD_OPTIONS} onValueChange={(v) => setPref("hold", v)} />
            </Row>
          </Section>

          <Section title="Voice & appearance">
            {savedRange ? (
              <Row label="Voice range" hint="Measured from your calibration.">
                <button
                  onClick={onCalibrate}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/60"
                >
                  {midiToName(savedRange.lo)} – {midiToName(savedRange.hi)} · redo
                </button>
              </Row>
            ) : (
              <Row label="Voice range" hint="A preset until you calibrate.">
                <SelectRow value={prefs.range} options={RANGE_OPTIONS} onValueChange={(v) => setPref("range", v)} />
              </Row>
            )}
            <Row label="Theme" hint="Light or dark.">
              <Segmented value={theme} options={THEME_OPTIONS} onValueChange={onThemeChange} />
            </Row>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

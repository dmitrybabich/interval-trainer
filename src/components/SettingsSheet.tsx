import { useTranslation } from "react-i18next";

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
import { SUPPORTED_LANGUAGES } from "@/i18n";
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
  TUTORIAL_OPTIONS,
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
  const { t, i18n } = useTranslation();

  // Localize an option table's labels for the given options.<group> namespace.
  function localize<V extends string>(
    group: string,
    options: readonly { readonly value: V; readonly label: string }[],
  ): readonly { readonly value: V; readonly label: string }[] {
    return options.map((o) => ({ value: o.value, label: t(`options.${group}.${o.value}`) }));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("settings.title")}</SheetTitle>
          <SheetDescription>{t("settings.description")}</SheetDescription>
        </SheetHeader>

        <div className="mt-3">
          <Section title={t("settings.sectionExercise")}>
            <Row label={t("settings.tutorial")} hint={t("settings.tutorialHint")}>
              <Segmented value={prefs.tutorial} options={localize("tutorial", TUTORIAL_OPTIONS)} onValueChange={(v) => setPref("tutorial", v)} />
            </Row>
            <Row label={t("settings.mode")} hint={t("settings.modeHint")}>
              <Segmented value={prefs.mode} options={localize("mode", MODE_OPTIONS)} onValueChange={(v) => setPref("mode", v)} />
            </Row>
            <Row label={t("settings.direction")} hint={t("settings.directionHint")}>
              <Segmented value={prefs.direction} options={localize("direction", DIR_OPTIONS)} onValueChange={(v) => setPref("direction", v)} />
            </Row>
            <Row label={t("settings.sweep")} hint={t("settings.sweepHint")}>
              <Segmented value={prefs.octaveMode} options={localize("octaveMode", OCTAVE_MODE_OPTIONS)} onValueChange={(v) => setPref("octaveMode", v)} />
            </Row>
          </Section>

          <Section title={t("settings.sectionFeedback")}>
            <Row label={t("settings.guideTone")} hint={t("settings.guideToneHint")}>
              <Segmented value={prefs.guide} options={localize("guide", GUIDE_OPTIONS)} onValueChange={(v) => setPref("guide", v)} />
            </Row>
            <Row label={t("settings.foundChime")} hint={t("settings.foundChimeHint")}>
              <Segmented value={prefs.foundHint} options={localize("foundHint", FOUND_HINT_OPTIONS)} onValueChange={(v) => setPref("foundHint", v)} />
            </Row>
            <Row label={t("settings.precision")} hint={t("settings.precisionHint")}>
              <SelectRow value={prefs.tol} options={localize("tol", TOL_OPTIONS)} onValueChange={(v) => setPref("tol", v)} />
            </Row>
            <Row label={t("settings.hold")} hint={t("settings.holdHint")}>
              <SelectRow value={prefs.hold} options={localize("hold", HOLD_OPTIONS)} onValueChange={(v) => setPref("hold", v)} />
            </Row>
          </Section>

          <Section title={t("settings.sectionVoice")}>
            {savedRange ? (
              <Row label={t("settings.voiceRange")} hint={t("settings.voiceRangeMeasured")}>
                <button
                  onClick={onCalibrate}
                  className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/60"
                >
                  {t("settings.voiceRangeRedo", { lo: midiToName(savedRange.lo), hi: midiToName(savedRange.hi) })}
                </button>
              </Row>
            ) : (
              <Row label={t("settings.voiceRange")} hint={t("settings.voiceRangePreset")}>
                <SelectRow value={prefs.range} options={localize("range", RANGE_OPTIONS)} onValueChange={(v) => setPref("range", v)} />
              </Row>
            )}
            <Row label={t("settings.theme")} hint={t("settings.themeHint")}>
              <Segmented value={theme} options={localize("theme", THEME_OPTIONS)} onValueChange={onThemeChange} />
            </Row>
            <Row label={t("settings.language")} hint={t("settings.languageHint")}>
              <Segmented
                value={i18n.resolvedLanguage ?? "en"}
                options={SUPPORTED_LANGUAGES}
                onValueChange={(v) => void i18n.changeLanguage(v)}
              />
            </Row>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

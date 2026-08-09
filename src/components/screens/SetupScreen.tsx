import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Prefs } from "@/lib/constants";
import { LEVELS } from "@/lib/levels";
import { midiToName, RANGE_BASE } from "@/lib/music";

// Mirrors the fallback in App.beginLevel so the card previews the range an
// uncalibrated exercise will actually use.
const RANGE_LOW_OFFSET = 7;
const RANGE_HIGH_OFFSET = 12;

interface Props {
  prefs: Prefs;
  savedRange: { lo: number; hi: number } | null;
  onStartLevel: (idx: number) => void;
  onCalibrate: () => void;
  status: string;
}

// The little dot-diagram that shows an interval's shape at a glance.
function IntervalGlyph({ steps, direction }: { steps: readonly number[]; direction: "up" | "down" }) {
  if (steps.length === 0) {
    return <span className="inline-block size-2.5 rounded-full bg-primary" />;
  }
  const dir = direction === "down" ? -1 : 1;
  const levels = [0];
  for (const s of steps) levels.push((levels.at(-1) ?? 0) + dir * s);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const span = Math.max(1, max - min);
  const height = 26;
  const step = 16;
  const width = 12 + (levels.length - 1) * step;
  const yOf = (lv: number) => height - 4 - ((lv - min) / span) * (height - 10);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {levels.map((lv, i) => {
        const x = 6 + i * step;
        const y = yOf(lv);
        const prev = levels[i - 1];
        return (
          <g key={i}>
            {prev !== undefined && (
              <line x1={6 + (i - 1) * step} y1={yOf(prev)} x2={x} y2={y} stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.5" />
            )}
            <circle cx={x} cy={y} r="3.5" fill="hsl(var(--primary))" />
          </g>
        );
      })}
    </svg>
  );
}

export function SetupScreen({ prefs, savedRange, onStartLevel, onCalibrate, status }: Props) {
  const { t } = useTranslation();
  const modeLabel = t(`options.mode.${prefs.mode}`);
  const dirLabel = prefs.direction === "down" ? t("setup.descending") : t("setup.ascending");
  const summary =
    prefs.guide === "on"
      ? t("setup.summaryWithGuide", { mode: modeLabel, direction: dirLabel })
      : t("setup.summary", { mode: modeLabel, direction: dirLabel });

  // Show the calibrated range if we have it, otherwise the estimate the app
  // falls back to (derived from the voice-range setting).
  const base = RANGE_BASE[prefs.range];
  const shownRange = savedRange ?? { lo: base - RANGE_LOW_OFFSET, hi: base + RANGE_HIGH_OFFSET };
  const rangeCaption = savedRange ? t("setup.calibrated") : t("setup.estimate");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {/* Your range — tap to calibrate. */}
      <button
        onClick={onCalibrate}
        className="theme-fade group flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary/60"
      >
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("setup.yourRange")}</div>
          <div className="mt-0.5 text-lg font-semibold">
            {midiToName(shownRange.lo)} – {midiToName(shownRange.hi)}
          </div>
          <div className="text-[11px] text-muted-foreground">{rangeCaption}</div>
        </div>
        <Sparkles className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
      </button>

      {/* Section heading */}
      <div className="px-1">
        <h2 className="text-lg font-semibold">{t("setup.chooseInterval")}</h2>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </div>

      {/* Levels as the hero — a clean list of interval cards. */}
      <div className="flex flex-col gap-2.5">
        {LEVELS.map((lv, i) => (
          <motion.button
            key={lv.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.035, type: "spring", stiffness: 320, damping: 30 }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onStartLevel(i)}
            className="theme-fade group flex items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/60"
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-sm font-bold text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{t(`levels.${lv.key}.name`)}</div>
              <div className="truncate text-xs text-muted-foreground">{t(`levels.${lv.key}.desc`)}</div>
            </div>
            <div className="hidden shrink-0 sm:block">
              <IntervalGlyph steps={lv.steps} direction={prefs.direction} />
            </div>
          </motion.button>
        ))}
      </div>

      {status && <div className="text-center text-sm text-[hsl(var(--near))]">{status}</div>}
    </div>
  );
}

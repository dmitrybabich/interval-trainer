import { ArrowLeft, Headphones, Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MicGate } from "@/components/MicGate";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { RefNote } from "@/components/WarmupRoll";
import { WarmupRoll } from "@/components/WarmupRoll";
import type { VoiceSample, WarmupUi } from "@/hooks/useWarmup";
import type { WarmupTrack } from "@/lib/warmupTracks";

interface Props {
  ui: WarmupUi;
  tracks: readonly WarmupTrack[];
  track: WarmupTrack;
  notes: readonly RefNote[];
  loMidi: number;
  hiMidi: number;
  tolCents: number;
  theme: "light" | "dark";
  trailRef: () => readonly VoiceSample[];
  currentTimeRef: () => number;
  onFrame: (cb: () => void) => () => void;
  onStart: () => void;
  onTogglePlay: () => void;
  onSeek: (sec: number) => void;
  onSelectTrack: (id: string) => void;
  onBack: () => void;
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WarmupScreen({
  ui,
  tracks,
  track,
  notes,
  loMidi,
  hiMidi,
  tolCents,
  theme,
  trailRef,
  currentTimeRef,
  onFrame,
  onStart,
  onTogglePlay,
  onSeek,
  onSelectTrack,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const trackOptions = tracks.map((tr) => ({ value: tr.id, label: t(tr.nameKey) }));

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] min-h-[440px] w-full max-w-xl flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} title={t("trainer.backToLevels")} className="text-muted-foreground">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{t("warmup.title")}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Headphones className="size-4" />
          {t("warmup.headphones")}
        </div>
      </div>

      {tracks.length > 1 && (
        <Segmented value={track.id} options={trackOptions} onValueChange={onSelectTrack} className="self-center" />
      )}

      <div className="min-h-0 flex-1">
        <MicGate ready={ui.ready} onStart={onStart}>
          <WarmupRoll
            notes={notes}
            loMidi={loMidi}
            hiMidi={hiMidi}
            tolCents={tolCents}
            theme={theme}
            trailRef={trailRef}
            currentTimeRef={currentTimeRef}
            onFrame={onFrame}
          />
        </MicGate>
      </div>

      <div className="flex items-center gap-3 px-1">
        <Button variant="ghost" size="icon" onClick={onTogglePlay} className="text-primary" title={ui.playing ? t("warmup.pause") : t("warmup.play")}>
          {ui.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </Button>
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{fmt(ui.currentTime)}</span>
        <input
          type="range"
          min={0}
          max={ui.duration || 0}
          step={0.1}
          value={ui.currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-primary"
        />
        <span className="w-10 text-xs tabular-nums text-muted-foreground">{fmt(ui.duration)}</span>
      </div>
    </div>
  );
}

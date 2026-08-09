import { ArrowLeft, Eraser } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DetectorRoll } from "@/components/DetectorRoll";
import { MicGate } from "@/components/MicGate";
import { Button } from "@/components/ui/button";
import type { DetectorUi, Dwell, PitchPoint } from "@/hooks/useDetector";

interface Props {
  ui: DetectorUi;
  theme: "light" | "dark";
  loMidi: number;
  hiMidi: number;
  trailRef: () => readonly PitchPoint[];
  dwellsRef: () => readonly Dwell[];
  liveRef: () => Dwell | null;
  clockRef: () => number;
  onFrame: (cb: () => void) => () => void;
  onStart: () => void;
  onClear: () => void;
  onBack: () => void;
}

export function DetectorScreen({
  ui,
  theme,
  loMidi,
  hiMidi,
  trailRef,
  dwellsRef,
  liveRef,
  clockRef,
  onFrame,
  onStart,
  onClear,
  onBack,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[440px] w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} title={t("trainer.backToLevels")} className="text-muted-foreground">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{t("detector.title")}</div>
        <Button variant="ghost" size="icon" onClick={onClear} disabled={!ui.ready} title={t("detector.clear")} className="text-muted-foreground">
          <Eraser className="size-5" />
        </Button>
      </div>

      <p className="px-1 text-xs text-muted-foreground">{t("detector.hint")}</p>

      <div className="min-h-0 flex-1">
        <MicGate ready={ui.ready} onStart={onStart}>
          <DetectorRoll
            theme={theme}
            loMidi={loMidi}
            hiMidi={hiMidi}
            trailRef={trailRef}
            dwellsRef={dwellsRef}
            liveRef={liveRef}
            clockRef={clockRef}
            onFrame={onFrame}
          />
        </MicGate>
      </div>
    </div>
  );
}

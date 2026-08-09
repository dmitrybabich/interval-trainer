import { DetectorRoll } from "@/components/DetectorRoll";
import { MicGate } from "@/components/MicGate";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import type { DetectorUi, Dwell, KeyRef, PitchPoint } from "@/hooks/useDetector";

interface Props {
  ui: DetectorUi;
  theme: "light" | "dark";
  loMidi: number;
  hiMidi: number;
  trailRef: () => readonly PitchPoint[];
  dwellsRef: () => readonly Dwell[];
  liveRef: () => Dwell | null;
  refsRef: () => readonly KeyRef[];
  clockRef: () => number;
  onFrame: (cb: () => void) => () => void;
  onStart: () => void;
  onPlayKey: (midi: number) => void;
}

export function DetectorScreen({
  ui,
  theme,
  loMidi,
  hiMidi,
  trailRef,
  dwellsRef,
  liveRef,
  refsRef,
  clockRef,
  onFrame,
  onStart,
  onPlayKey,
}: Props) {
  return (
    <div className="flex size-full min-h-[440px] flex-col gap-2">
      <div className="min-h-0 flex-1">
        <MicGate ready={ui.ready} onStart={onStart}>
          <DetectorRoll
            theme={theme}
            loMidi={loMidi}
            hiMidi={hiMidi}
            trailRef={trailRef}
            dwellsRef={dwellsRef}
            liveRef={liveRef}
            refsRef={refsRef}
            clockRef={clockRef}
            onFrame={onFrame}
          />
        </MicGate>
      </div>

      <PianoKeyboard loMidi={loMidi} hiMidi={hiMidi} onPlay={onPlayKey} />
    </div>
  );
}

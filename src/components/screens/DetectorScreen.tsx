import { DetectorRoll } from "@/components/DetectorRoll";
import { MicGate } from "@/components/MicGate";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { PianoQuickKeys } from "@/components/PianoQuickKeys";
import type { DetectorUi, Dwell, KeyRef, PitchPoint } from "@/hooks/useDetector";
import { usePiano } from "@/hooks/usePiano";

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
  onDrone: (midi: number | null) => void;
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
  onDrone,
}: Props) {
  const piano = usePiano({ rangeLo: loMidi, rangeHi: hiMidi, onPlay: onPlayKey, onDrone });

  return (
    <div className="flex size-full min-h-[440px] flex-col gap-2">
      <div className="relative min-h-0 flex-1">
        <MicGate ready={ui.ready} onStart={onStart}>
          <DetectorRoll
            theme={theme}
            loMidi={loMidi}
            hiMidi={hiMidi}
            trailRef={trailRef}
            dwellsRef={dwellsRef}
            liveRef={liveRef}
            refsRef={refsRef}
            droneMidi={piano.droneMidi}
            clockRef={clockRef}
            onFrame={onFrame}
          />
        </MicGate>
        {ui.ready && <PianoQuickKeys piano={piano} />}
      </div>

      <PianoKeyboard piano={piano} />
    </div>
  );
}

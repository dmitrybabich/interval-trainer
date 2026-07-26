 
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

import { CalibrationScreen } from "@/components/screens/CalibrationScreen";
import { SetupScreen } from "@/components/screens/SetupScreen";
import { TrainerScreen } from "@/components/screens/TrainerScreen";
import { useCalibration } from "@/hooks/useCalibration";
import { usePrefs } from "@/hooks/usePrefs";
import { useTrainer } from "@/hooks/useTrainer";
import { RANGE_BASE } from "@/lib/music";
import { loadSavedRange } from "@/lib/persistence";

type Screen = "setup" | "calib" | "trainer";

const RANGE_LOW_OFFSET = 7;
const RANGE_HIGH_OFFSET = 12;

export function App() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [setupStatus, setSetupStatus] = useState("");
  const [savedRange, setSavedRange] = useState(() => loadSavedRange());

  const { prefs, setPref } = usePrefs();
  const { ui, actions, bufTrail, onFrame, engine } = useTrainer();
  const calib = useCalibration(engine, screen === "calib");

  // When calibration finishes, refresh the shown range + return to setup.
  useEffect(() => {
    if (calib.ui.finishedRange) {
      setSavedRange(calib.ui.finishedRange);
      const t = window.setTimeout(() => setScreen("setup"), 1100);
      return () => clearTimeout(t);
    }
  }, [calib.ui.finishedRange]);

  const beginLevel = useCallback(
    async (levelIdx: number) => {
      setSetupStatus("Requesting mic…");
      const ok = await actions.requestMic((msg) => setSetupStatus(msg));
      if (!ok) return;
      setSetupStatus("");

      // Range fallback — if there's no saved range, pick a rough guess from the
      // preferred voice range.
      const base = RANGE_BASE[prefs.range];
      const rangeFallback = { base, lo: base - RANGE_LOW_OFFSET, hi: base + RANGE_HIGH_OFFSET };

      await actions.startLevel(levelIdx, {
        tolCents: Number(prefs.tol),
        holdMs: Number(prefs.hold),
        mode: prefs.mode,
        direction: prefs.direction,
        guideTone: prefs.guide === "on",
        rangeFallback,
      });
      setScreen("trainer");
    },
    [actions, prefs],
  );

  const beginCalibration = useCallback(async () => {
    setSetupStatus("Requesting mic…");
    const ok = await actions.requestMic((msg) => setSetupStatus(msg));
    if (!ok) return;
    setSetupStatus("");
    setScreen("calib");
  }, [actions]);

  const leaveTrainer = useCallback(() => {
    actions.leaveTrainer();
    actions.reloadRangeFromStorage();
    setSavedRange(loadSavedRange());
    setScreen("setup");
    setSetupStatus("");
  }, [actions]);

  // Spacebar = replay hint (never leaks by-ear targets — playHint is always note 1).
  useEffect(() => {
    if (screen !== "trainer") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "SELECT" || t.tagName === "BUTTON" || t.tagName === "INPUT")) return;
      e.preventDefault();
      actions.playHint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, actions]);

  const trainerActions = { ...actions, leaveTrainer };

  return (
    <div className="flex min-h-screen flex-col items-center">
      <header className="px-4 pb-1.5 pt-6 text-center">
        <h1 className="text-xl font-semibold tracking-wide">🎵 Interval Trainer</h1>
        <div className="mt-1 text-xs text-muted-foreground">
          Sing "ah". Hit the note, hold it, hear the bip. Then slide to the next.
        </div>
      </header>

      <main className="w-full flex-1 px-4 pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {screen === "setup" && (
              <SetupScreen
                prefs={prefs}
                setPref={setPref}
                savedRange={savedRange}
                soundBadge={ui.badge}
                onStartLevel={(i) => void beginLevel(i)}
                onCalibrate={() => void beginCalibration()}
                status={setupStatus}
              />
            )}
            {screen === "calib" && (
              <CalibrationScreen ui={calib.ui} onCapture={calib.capture} onBack={() => setScreen("setup")} />
            )}
            {screen === "trainer" && (
              <TrainerScreen ui={ui} actions={trainerActions} trailRef={bufTrail} onFrame={onFrame} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="pb-8 pt-2 text-xs text-muted-foreground">
        Pitch detection by{" "}
        <a href="https://github.com/ianprime0509/pitchy" target="_blank" rel="noopener" className="text-primary hover:underline">
          pitchy
        </a>{" "}
        · runs entirely in your browser, nothing uploaded.
      </footer>
    </div>
  );
}

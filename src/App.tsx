import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CalibrationScreen } from "@/components/screens/CalibrationScreen";
import { SetupScreen } from "@/components/screens/SetupScreen";
import { TrainerScreen } from "@/components/screens/TrainerScreen";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Button } from "@/components/ui/button";
import { useCalibration } from "@/hooks/useCalibration";
import { usePrefs } from "@/hooks/usePrefs";
import { useTheme } from "@/hooks/useTheme";
import { useTrainer } from "@/hooks/useTrainer";
import { RANGE_BASE } from "@/lib/music";
import { loadSavedRange } from "@/lib/persistence";

type Screen = "setup" | "calib" | "trainer";

const RANGE_LOW_OFFSET = 7;
const RANGE_HIGH_OFFSET = 12;

export function App() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [setupStatus, setSetupStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedRange, setSavedRange] = useState(() => loadSavedRange());

  const { theme, toggle: toggleTheme } = useTheme();
  const { prefs, setPref } = usePrefs();
  const { ui, actions, bufTrail, onFrame, engine } = useTrainer();
  const calib = useCalibration(engine, screen === "calib");

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
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pb-2 pt-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Interval Trainer</h1>
          <p className="text-xs text-muted-foreground">Sing it. Hold it. Hear the chime.</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full text-muted-foreground"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ opacity: 0, rotate: -30, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 30, scale: 0.7 }}
              transition={{ duration: 0.18 }}
            >
              {theme === "dark" ? <Moon className="size-5" /> : <Sun className="size-5" />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </header>

      <main className="w-full flex-1 px-4 pb-6 pt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {screen === "setup" && (
              <SetupScreen
                prefs={prefs}
                savedRange={savedRange}
                onStartLevel={(i) => void beginLevel(i)}
                onCalibrate={() => void beginCalibration()}
                onOpenSettings={() => setSettingsOpen(true)}
                status={setupStatus}
              />
            )}
            {screen === "calib" && (
              <CalibrationScreen ui={calib.ui} onCapture={calib.capture} onBack={() => setScreen("setup")} />
            )}
            {screen === "trainer" && (
              <TrainerScreen ui={ui} actions={trainerActions} theme={theme} trailRef={bufTrail} onFrame={onFrame} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mx-auto w-full max-w-xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground/70">
        <a
          href="https://github.com/ianprime0509/pitchy"
          target="_blank"
          rel="noopener"
          className="transition-colors hover:text-foreground"
        >
          Pitch detection by pitchy
        </a>
      </footer>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} prefs={prefs} setPref={setPref} />
    </div>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { CalibrationScreen } from "@/components/screens/CalibrationScreen";
import { SetupScreen } from "@/components/screens/SetupScreen";
import { TrainerScreen } from "@/components/screens/TrainerScreen";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Button } from "@/components/ui/button";
import { useCalibration } from "@/hooks/useCalibration";
import { usePrefs } from "@/hooks/usePrefs";
import { useTheme } from "@/hooks/useTheme";
import { useTrainer } from "@/hooks/useTrainer";
import { LEVELS } from "@/lib/levels";
import { RANGE_BASE } from "@/lib/music";
import { loadSavedRange } from "@/lib/persistence";

const RANGE_LOW_OFFSET = 7;
const RANGE_HIGH_OFFSET = 12;

function isTrainerPath(pathname: string): boolean {
  return pathname.startsWith("/level/");
}

function AppInner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [setupStatus, setSetupStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedRange, setSavedRange] = useState(() => loadSavedRange());
  // Gates the trainer route: only render it for a session we actually started.
  // A cold deep-link / refresh has no live session (or mic gesture), so it
  // redirects to setup instead of showing an empty meter.
  const [sessionActive, setSessionActive] = useState(false);
  const sessionActiveRef = useRef(false);

  const { theme, setTheme } = useTheme();
  const { prefs, setPref } = usePrefs();
  const { ui, actions, bufTrail, onFrame, engine } = useTrainer();
  const onCalibScreen = location.pathname === "/calibrate";
  const calib = useCalibration(engine, onCalibScreen);

  useEffect(() => {
    if (calib.ui.finishedRange) {
      setSavedRange(calib.ui.finishedRange);
      const t = window.setTimeout(() => navigate("/"), 1100);
      return () => clearTimeout(t);
    }
  }, [calib.ui.finishedRange, navigate]);

  // Tear the session down whenever we leave the trainer route — covers the
  // Back button and the browser's back/forward alike, in one place.
  useEffect(() => {
    if (!isTrainerPath(location.pathname) && sessionActiveRef.current) {
      actions.leaveTrainer();
      actions.reloadRangeFromStorage();
      setSavedRange(loadSavedRange());
      sessionActiveRef.current = false;
      setSessionActive(false);
    }
  }, [location.pathname, actions]);

  const beginLevel = useCallback(
    async (levelIdx: number) => {
      setSetupStatus("Requesting mic…");
      const ok = await actions.requestMic((msg) => setSetupStatus(msg));
      if (!ok) return;
      setSetupStatus("");

      const base = RANGE_BASE[prefs.range];
      const rangeFallback = { base, lo: base - RANGE_LOW_OFFSET, hi: base + RANGE_HIGH_OFFSET };

      // The tutorial ladder applies to the single-note level (the foundation
      // pitch-matching drill) and every single-interval level (the interval
      // ramp). Multi-step levels (triad) have no single thing to ladder, so they
      // run flat — as does opt-out free practice.
      const steps = LEVELS[levelIdx]?.steps.length ?? 0;
      const hasLadder = steps <= 1;
      const useLadder = prefs.tutorial === "on" && hasLadder;

      await actions.startLevel(levelIdx, {
        tolCents: Number(prefs.tol),
        holdMs: Number(prefs.hold),
        mode: prefs.mode,
        direction: prefs.direction,
        guideTone: prefs.guide === "on",
        foundHint: prefs.foundHint === "on",
        octaveMode: prefs.octaveMode === "on",
        ladder: useLadder,
        rangeFallback,
      });
      sessionActiveRef.current = true;
      setSessionActive(true);
      navigate(`/level/${levelIdx}`);
    },
    [actions, prefs, navigate],
  );

  const beginCalibration = useCallback(async () => {
    setSetupStatus("Requesting mic…");
    const ok = await actions.requestMic((msg) => setSetupStatus(msg));
    if (!ok) return;
    setSetupStatus("");
    navigate("/calibrate");
  }, [actions, navigate]);

  // Leaving the trainer is just navigation — the pathname effect above does the
  // actual teardown, so the button and the browser back button behave the same.
  const leaveTrainer = useCallback(() => navigate("/"), [navigate]);

  // Spacebar = replay hint (never leaks by-ear targets — playHint is always note 1).
  useEffect(() => {
    if (!isTrainerPath(location.pathname)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "SELECT" || t.tagName === "BUTTON" || t.tagName === "INPUT")) return;
      e.preventDefault();
      actions.playHint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [location.pathname, actions]);

  const trainerActions = { ...actions, leaveTrainer };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pb-2 pt-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("app.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          className="rounded-full text-muted-foreground"
          title="Settings"
        >
          <SlidersHorizontal className="size-5" />
        </Button>
      </header>

      <main className="w-full flex-1 px-4 pb-6 pt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Routes location={location}>
              <Route
                path="/"
                element={
                  <SetupScreen
                    prefs={prefs}
                    savedRange={savedRange}
                    onStartLevel={(i) => void beginLevel(i)}
                    onCalibrate={() => void beginCalibration()}
                    status={setupStatus}
                  />
                }
              />
              <Route
                path="/calibrate"
                element={<CalibrationScreen ui={calib.ui} onCapture={calib.capture} onBack={() => navigate("/")} />}
              />
              <Route
                path="/level/:idx"
                element={
                  sessionActive ? (
                    <TrainerScreen ui={ui} actions={trainerActions} theme={theme} trailRef={bufTrail} onFrame={onFrame} />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
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
          {t("app.pitchCredit")}
        </a>
      </footer>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        prefs={prefs}
        setPref={setPref}
        theme={theme}
        onThemeChange={setTheme}
        savedRange={savedRange}
        onCalibrate={() => {
          setSettingsOpen(false);
          void beginCalibration();
        }}
      />
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  );
}

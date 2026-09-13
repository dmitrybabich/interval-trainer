import { useCallback, useEffect, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { CalibrationScreen } from "@/components/screens/CalibrationScreen";
import { DetectorScreen } from "@/components/screens/DetectorScreen";
import { PracticeItemPlayer, PracticeLibrary } from "@/components/screens/PracticeScreen";
import { SetupScreen } from "@/components/screens/SetupScreen";
import { TrainerScreen } from "@/components/screens/TrainerScreen";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCalibration } from "@/hooks/useCalibration";
import { useDetector } from "@/hooks/useDetector";
import { usePrefs } from "@/hooks/usePrefs";
import { useTheme } from "@/hooks/useTheme";
import { useTrainer } from "@/hooks/useTrainer";
import { LEVELS } from "@/lib/levels";
import { RANGE_BASE } from "@/lib/music";
import { loadSavedRange } from "@/lib/persistence";

const RANGE_LOW_OFFSET = 7;
const RANGE_HIGH_OFFSET = 12;

// The comfortable range around a voice-range base, used as the fallback when the
// user hasn't calibrated.
function estimatedRange(base: number): { lo: number; hi: number } {
  return { lo: base - RANGE_LOW_OFFSET, hi: base + RANGE_HIGH_OFFSET };
}

function isTrainerPath(pathname: string): boolean {
  return pathname.startsWith("/level/");
}

function isDetectorPath(pathname: string): boolean {
  return pathname === "/";
}

// A bookmarkable mic page's route lifecycle: while the route is active and the
// mic isn't live yet, silently reopen it if the browser already granted
// permission (no prompt, no gesture); tear it down whenever the route is left.
function useMicRouteLifecycle({
  active,
  ready,
  start,
  stop,
}: {
  active: boolean;
  ready: boolean;
  start: () => void;
  stop: () => void;
}): void {
  useEffect(() => {
    if (!active || ready) return;
    if (!navigator.permissions?.query) return;
    let cancelled = false;
    void navigator.permissions
      .query({ name: "microphone" })
      .then((status) => {
        if (!cancelled && status.state === "granted") start();
        return undefined;
      })
      .catch(() => undefined); // Firefox rejects "microphone" — fall back to tap
    return () => {
      cancelled = true;
    };
  }, [active, ready, start]);

  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);
}

// Spacebar on the trainer route replays the hint (whole melody in guided mode,
// just note 1 in ear mode — that's decided in the action). Ignored while a
// control is focused so Space still toggles buttons/selects normally.
function useReplayHintKey(active: boolean, playHint: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "SELECT" || t.tagName === "BUTTON" || t.tagName === "INPUT")) return;
      e.preventDefault();
      playHint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, playHint]);
}

function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();

  const [setupStatus, setSetupStatus] = useState("");
  const [savedRange, setSavedRange] = useState(() => loadSavedRange());
  // Gates the trainer route: only render for a session we started (a cold deep-link
  // has no live session/mic, so it redirects to setup instead of an empty meter).
  const [sessionActive, setSessionActive] = useState(false);
  const sessionActiveRef = useRef(false);

  const { theme, setTheme } = useTheme();
  const { prefs, setPref } = usePrefs();
  const { ui, actions, bufTrail, onFrame, engine } = useTrainer();
  const detector = useDetector();
  const onCalibScreen = location.pathname === "/calibrate";
  const calib = useCalibration(engine, onCalibScreen);

  useEffect(() => {
    if (calib.ui.finishedRange) {
      setSavedRange(calib.ui.finishedRange);
      const t = window.setTimeout(() => navigate("/intervals"), 1100);
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

  // Fixed pitch window for the detector's Y axis: your calibrated range if we
  // have it, else the voice-range estimate — the same span the setup card shows.
  const detectorRange = savedRange ?? estimatedRange(RANGE_BASE[prefs.range]);

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

  // Plain bookmarkable pages grant the mic on tap (browsers gate getUserMedia behind
  // a gesture).
  const detectorStart = detector.start;
  const startDetectorMic = useCallback(() => {
    void detectorStart(() => undefined);
  }, [detectorStart]);

  // Detector: silently reopen the mic on a refresh if permission is already granted,
  // and tear it down on leave.
  useMicRouteLifecycle({
    active: isDetectorPath(location.pathname),
    ready: detector.ui.ready,
    start: startDetectorMic,
    stop: detector.stop,
  });

  const beginCalibration = useCallback(async () => {
    setSetupStatus("Requesting mic…");
    const ok = await actions.requestMic((msg) => setSetupStatus(msg));
    if (!ok) return;
    setSetupStatus("");
    navigate("/calibrate");
  }, [actions, navigate]);

  // Leaving the trainer is just navigation — the pathname effect above does the
  // actual teardown, so the button and the browser back button behave the same.
  const leaveTrainer = useCallback(() => navigate("/intervals"), [navigate]);

  useReplayHintKey(isTrainerPath(location.pathname), actions.playHint);

  const trainerActions = { ...actions, leaveTrainer };

  return (
    <Routes location={location}>
      <Route
        element={
          <Layout
            prefs={prefs}
            setPref={setPref}
            theme={theme}
            onThemeChange={setTheme}
            savedRange={savedRange}
            onCalibrate={() => void beginCalibration()}
          />
        }
      >
        <Route
          path="/"
          element={
            <DetectorScreen
              ui={detector.ui}
              theme={theme}
              loMidi={detectorRange.lo}
              hiMidi={detectorRange.hi}
              trailRef={detector.trailRef}
              dwellsRef={detector.dwellsRef}
              liveRef={detector.liveRef}
              refsRef={detector.refsRef}
              clockRef={detector.clockRef}
              onFrame={detector.onFrame}
              onStart={startDetectorMic}
              onPlayKey={detector.playKey}
              onDrone={detector.setDrone}
            />
          }
        />
        <Route
          path="/intervals"
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
          element={<CalibrationScreen ui={calib.ui} onCapture={calib.capture} onBack={() => navigate("/intervals")} />}
        />
        <Route
          path="/level/:idx"
          element={
            sessionActive ? (
              <TrainerScreen
                ui={ui}
                actions={trainerActions}
                theme={theme}
                trailRef={bufTrail}
                onFrame={onFrame}
                blind={prefs.blind === "on"}
              />
            ) : (
              <Navigate to="/intervals" replace />
            )
          }
        />
        <Route path="/practice" element={<PracticeLibrary />} />
        <Route path="/practice/:itemId" element={<PracticeItemPlayer />} />
        {/* Old per-category routes are gone — everything is a practice item now. */}
        <Route path="/warmup/*" element={<Navigate to="/practice" replace />} />
        <Route path="/exercises/*" element={<Navigate to="/practice" replace />} />
        <Route path="/songs/*" element={<Navigate to="/practice" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <HashRouter>
        <AppInner />
      </HashRouter>
    </TooltipProvider>
  );
}

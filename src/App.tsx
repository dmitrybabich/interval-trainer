import { useCallback, useEffect, useRef, useState } from "react";
import { HashRouter, matchPath, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { CalibrationScreen } from "@/components/screens/CalibrationScreen";
import { DetectorScreen } from "@/components/screens/DetectorScreen";
import { SetupScreen } from "@/components/screens/SetupScreen";
import { TrainerScreen } from "@/components/screens/TrainerScreen";
import { WarmupScreen } from "@/components/screens/WarmupScreen";
import { useCalibration } from "@/hooks/useCalibration";
import { useDetector } from "@/hooks/useDetector";
import { usePrefs } from "@/hooks/usePrefs";
import { useTheme } from "@/hooks/useTheme";
import { useTrainer } from "@/hooks/useTrainer";
import { useWarmup } from "@/hooks/useWarmup";
import { LEVELS } from "@/lib/levels";
import { RANGE_BASE } from "@/lib/music";
import { loadSavedRange } from "@/lib/persistence";
import { trackById, WARMUP_TRACKS } from "@/lib/warmupTracks";

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

function isWarmupPath(pathname: string): boolean {
  return pathname.startsWith("/warmup");
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
  // Gates the trainer route: only render it for a session we actually started.
  // A cold deep-link / refresh has no live session (or mic gesture), so it
  // redirects to setup instead of showing an empty meter.
  const [sessionActive, setSessionActive] = useState(false);
  const sessionActiveRef = useRef(false);

  // Which warm-up track is selected comes straight from the URL, so every track
  // is its own bookmarkable link. Falls back to the first track off /warmup.
  const warmupMatch = matchPath("/warmup/:trackId", location.pathname);
  const track = trackById(warmupMatch?.params.trackId);
  const warmupAudio = `${import.meta.env.BASE_URL}${track.audio}`;

  const { theme, setTheme } = useTheme();
  const { prefs, setPref } = usePrefs();
  const { ui, actions, bufTrail, onFrame, engine } = useTrainer();
  const warmup = useWarmup(warmupAudio);
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

  // Warm-up is a plain page: the card just navigates there (bookmarkable). The
  // page itself grants the mic on tap via MicGate, since browsers require a
  // gesture — so a cold deep-link / refresh lands on a working page, not a
  // redirect.
  const warmupStart = warmup.start;
  const startWarmupMic = useCallback(() => {
    void warmupStart(() => undefined);
  }, [warmupStart]);

  // Same shape as the warm-up: a plain bookmarkable page that grants the mic on
  // tap (browsers gate getUserMedia behind a gesture).
  const detectorStart = detector.start;
  const startDetectorMic = useCallback(() => {
    void detectorStart(() => undefined);
  }, [detectorStart]);

  // Reopen the mic on refresh if already granted, tear it down on leave.
  const warmupStop = warmup.stop;
  useMicRouteLifecycle({
    active: isWarmupPath(location.pathname),
    ready: warmup.ui.ready,
    start: startWarmupMic,
    stop: warmupStop,
  });
  // Also stop when switching tracks — the new track's audio element reloads with
  // a fresh src, and the lifecycle's permission effect reopens the mic.
  useEffect(() => warmupStop, [track.id, warmupStop]);

  // Detector mirrors the warm-up lifecycle: silently reopen the mic on a
  // refresh if permission is already granted, and tear it down on leave.
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
  // Back to the intervals hub, since that's where a level is launched from.
  const leaveTrainer = useCallback(() => navigate("/intervals"), [navigate]);

  useReplayHintKey(isTrainerPath(location.pathname), actions.playHint);

  const trainerActions = { ...actions, leaveTrainer };

  return (
    <>
      {/* Backing track for the warm-up. Persists across routes so its ref is live
          before the screen mounts; preload="auto" so scrubbing is responsive.
          src follows the URL-selected track. */}
      <audio ref={warmup.audioRef} src={warmupAudio} preload="auto" />
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
                <TrainerScreen ui={ui} actions={trainerActions} theme={theme} trailRef={bufTrail} onFrame={onFrame} />
              ) : (
                <Navigate to="/intervals" replace />
              )
            }
          />
          <Route path="/warmup" element={<Navigate to={`/warmup/${WARMUP_TRACKS[0].id}`} replace />} />
          <Route
            path="/warmup/:trackId"
            element={
              <WarmupScreen
                ui={warmup.ui}
                tracks={WARMUP_TRACKS}
                track={track}
                notes={track.notes}
                loMidi={track.loMidi}
                hiMidi={track.hiMidi}
                tolCents={Number(prefs.tol)}
                theme={theme}
                trailRef={warmup.trailRef}
                currentTimeRef={warmup.currentTimeRef}
                onFrame={warmup.onFrame}
                onStart={startWarmupMic}
                onTogglePlay={warmup.togglePlay}
                onSeek={warmup.seek}
                onSelectTrack={(id) => navigate(`/warmup/${id}`)}
                onBack={() => navigate("/intervals")}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  );
}

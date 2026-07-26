// Interval landing (final note) needs a quick "touch" to confirm the pitch (the
// drill is the leap, not endurance) — the Hold setting governs the single-note drill.
export const TOUCH_MS = 490;

// Intermediate notes (e.g. note 1 before the leap) just need a brief but REAL
// dwell so you actually sit on the interval rather than glissando through it — no beep.
export const PASS_MS = 300;

// Min input RMS to count as your voice while the guide-tone drone is playing —
// above the drone's mic bleed, below normal singing.
export const DRONE_VOICE_RMS = 0.05;

// Sampled piano runs quieter than our synth — bump it so both feel level.
export const PIANO_GAIN = 6.0;

// Pitch detection thresholds — a note is considered "sung" when clarity is high
// and pitch falls within the human singing range.
export const CLARITY_THRESHOLD = 0.9;
export const PITCH_HZ_MIN = 50;
export const PITCH_HZ_MAX = 1500;

// After 2s stuck on a wrong note, auto-replay the start note as a hint.
export const WRONG_NOTE_HINT_MS = 2000;

// Anchor beep fires after sitting on the previous note this long.
export const ANCHOR_HOLD_MS = 180;

// Length of the sung-pitch trail on the canvas meter.
export const TRAIL_LENGTH = 240;

// Semitones shown above/below the target on the meter (1 octave window).
export const METER_SPAN_SEMITONES = 8;

// FFT size for the analyser — matches the pitchy buffer.
export const FFT_SIZE = 2048;

// Analyser dB floor for pitchy detector.
export const MIN_VOLUME_DB = -30;

// ---------- Dropdown options ----------

export interface Option<V extends string> {
  readonly value: V;
  readonly label: string;
}

export const RANGE_OPTIONS = [
  { value: "low", label: "Low (bass / baritone)" },
  { value: "mid", label: "Mid (tenor / alto)" },
  { value: "high", label: "High (soprano)" },
] as const satisfies readonly Option<"low" | "mid" | "high">[];

export const TOL_OPTIONS = [
  { value: "50", label: "Closest note wins (±50¢)" },
  { value: "45", label: "Easy (±45 cents)" },
  { value: "30", label: "Normal (±30 cents)" },
  { value: "18", label: "Strict (±18 cents)" },
] as const satisfies readonly Option<"50" | "45" | "30" | "18">[];

export const HOLD_OPTIONS = [
  { value: "350", label: "Quick (0.35s)" },
  { value: "600", label: "Normal (0.6s)" },
  { value: "1000", label: "Long (1.0s)" },
  { value: "2000", label: "Very long (2.0s)" },
  { value: "3000", label: "Extra long (3.0s)" },
  { value: "4000", label: "Longest (4.0s)" },
] as const satisfies readonly Option<"350" | "600" | "1000" | "2000" | "3000" | "4000">[];

export const MODE_OPTIONS = [
  { value: "guided", label: "Guided (show every target)" },
  { value: "ear", label: "Ear (only give the start note)" },
] as const satisfies readonly Option<"guided" | "ear">[];

export const DIR_OPTIONS = [
  { value: "up", label: "Up ↑" },
  { value: "down", label: "Down ↓" },
] as const satisfies readonly Option<"up" | "down">[];

export const GUIDE_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "on", label: "Easy — drone on note 1" },
] as const satisfies readonly Option<"off" | "on">[];

export type RangeVal = (typeof RANGE_OPTIONS)[number]["value"];
export type TolVal = (typeof TOL_OPTIONS)[number]["value"];
export type HoldVal = (typeof HOLD_OPTIONS)[number]["value"];
export type ModeVal = (typeof MODE_OPTIONS)[number]["value"];
export type DirVal = (typeof DIR_OPTIONS)[number]["value"];
export type GuideVal = (typeof GUIDE_OPTIONS)[number]["value"];

export interface Prefs {
  range: RangeVal;
  tol: TolVal;
  hold: HoldVal;
  mode: ModeVal;
  direction: DirVal;
  guide: GuideVal;
}

export const DEFAULT_PREFS: Prefs = {
  range: "mid",
  tol: "50",
  hold: "3000",
  mode: "guided",
  direction: "up",
  guide: "off",
};

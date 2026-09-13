import {
  ANY_OCTAVE_OPTIONS,
  BLIND_OPTIONS,
  DEFAULT_PREFS,
  DIR_OPTIONS,
  FOUND_HINT_OPTIONS,
  GUIDE_OPTIONS,
  HOLD_OPTIONS,
  MODE_OPTIONS,
  OCTAVE_MODE_OPTIONS,
  type Prefs,
  RANGE_OPTIONS,
  TOL_OPTIONS,
  TUTORIAL_OPTIONS,
} from "@/lib/constants";

const VALID_VALUES: Record<keyof Prefs, readonly string[]> = {
  range: RANGE_OPTIONS.map((o) => o.value),
  tol: TOL_OPTIONS.map((o) => o.value),
  hold: HOLD_OPTIONS.map((o) => o.value),
  mode: MODE_OPTIONS.map((o) => o.value),
  direction: DIR_OPTIONS.map((o) => o.value),
  guide: GUIDE_OPTIONS.map((o) => o.value),
  foundHint: FOUND_HINT_OPTIONS.map((o) => o.value),
  octaveMode: OCTAVE_MODE_OPTIONS.map((o) => o.value),
  tutorial: TUTORIAL_OPTIONS.map((o) => o.value),
  anyOctave: ANY_OCTAVE_OPTIONS.map((o) => o.value),
  blind: BLIND_OPTIONS.map((o) => o.value),
};

// localStorage keys, all try/catch-guarded so private-mode failures are silent.
export const RANGE_KEY = "intervalTrainer.range";
export const PREFS_KEY = "intervalTrainer.prefs";
export const ANCHORS_KEY = "intervalTrainer.anchors";
export const KEY_OCTAVE_KEY = "intervalTrainer.detectorKeyOctave";
export const PIANO_VIEW_KEY = "intervalTrainer.detectorPianoView";

// The octave the detector piano centres on. Returns null when unset or bogus so
// the caller can fall back to a sensible default.
export function loadKeyOctave(): number | null {
  try {
    const raw = localStorage.getItem(KEY_OCTAVE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveKeyOctave(octave: number): void {
  try {
    localStorage.setItem(KEY_OCTAVE_KEY, String(octave));
  } catch {
    /* no-op */
  }
}

// Piano view: one octave, or the whole configured span. Persisted as a plain
// string; anything unrecognised reads back as null so the caller defaults.
export type PianoView = "octave" | "range";

export function loadPianoView(): PianoView | null {
  try {
    const raw = localStorage.getItem(PIANO_VIEW_KEY);
    return raw === "octave" || raw === "range" ? raw : null;
  } catch {
    return null;
  }
}

export function savePianoView(view: PianoView): void {
  try {
    localStorage.setItem(PIANO_VIEW_KEY, view);
  } catch {
    /* no-op */
  }
}

// Chosen song anchor per interval level: { [levelKey]: anchorKey }. Validation
// against the actual option list happens at read time (resolveAnchor), so a stale
// or bogus key just falls back to the default — no schema needed here.
export type SavedAnchors = Record<string, string>;

export function loadAnchorChoices(): SavedAnchors {
  try {
    const raw = localStorage.getItem(ANCHORS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: SavedAnchors = {};
    for (const [levelKey, choice] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof choice === "string") out[levelKey] = choice;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveAnchorChoice(levelKey: string, anchorKey: string): void {
  try {
    const next = { ...loadAnchorChoices(), [levelKey]: anchorKey };
    localStorage.setItem(ANCHORS_KEY, JSON.stringify(next));
  } catch {
    /* no-op */
  }
}

export interface SavedRange {
  lo: number;
  hi: number;
}

export function loadSavedRange(): SavedRange | null {
  try {
    const raw = localStorage.getItem(RANGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "lo" in parsed &&
      "hi" in parsed &&
      Number.isFinite((parsed as SavedRange).lo) &&
      Number.isFinite((parsed as SavedRange).hi) &&
      (parsed as SavedRange).hi > (parsed as SavedRange).lo
    ) {
      const r = parsed as SavedRange;
      return { lo: r.lo, hi: r.hi };
    }
  } catch {
    /* no-op */
  }
  return null;
}

export function saveRange(range: SavedRange): void {
  try {
    localStorage.setItem(RANGE_KEY, JSON.stringify(range));
  } catch {
    /* no-op */
  }
}

// Load prefs, filling in defaults for any missing or invalid keys.
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PREFS };
    const out: Record<keyof Prefs, string> = { ...DEFAULT_PREFS };
    for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === "string" && VALID_VALUES[key].includes(v)) out[key] = v;
    }
    return out as Prefs;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* no-op */
  }
}

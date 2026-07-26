import {
  DEFAULT_PREFS,
  DIR_OPTIONS,
  GUIDE_OPTIONS,
  HOLD_OPTIONS,
  MODE_OPTIONS,
  type Prefs,
  RANGE_OPTIONS,
  TOL_OPTIONS,
} from "@/lib/constants";

const VALID_VALUES: Record<keyof Prefs, readonly string[]> = {
  range: RANGE_OPTIONS.map((o) => o.value),
  tol: TOL_OPTIONS.map((o) => o.value),
  hold: HOLD_OPTIONS.map((o) => o.value),
  mode: MODE_OPTIONS.map((o) => o.value),
  direction: DIR_OPTIONS.map((o) => o.value),
  guide: GUIDE_OPTIONS.map((o) => o.value),
};

// Two localStorage keys, both try/catch-guarded so private-mode failures are silent.
export const RANGE_KEY = "intervalTrainer.range";
export const PREFS_KEY = "intervalTrainer.prefs";

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

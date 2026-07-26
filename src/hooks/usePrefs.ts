import { useCallback, useEffect, useRef, useState } from "react";

import { type Prefs } from "@/lib/constants";
import { loadPrefs, savePrefs } from "@/lib/persistence";

/**
 * React state for the six setup-screen dropdowns, persisted to localStorage.
 * Behavior parity with the original PREF_IDS list: every change is written back.
 */
export function usePrefs(): {
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
} {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  // Skip the first effect (right after load) so we don't rewrite the same value.
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    savePrefs(prefs);
  }, [prefs]);

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  return { prefs, setPref };
}

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "intervalTrainer.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// An explicit choice the user saved, or null if they've never picked one — in
// which case we follow the OS.
function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* no-op */
  }
  return null;
}

function systemTheme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches) return "dark";
  return "light";
}

/**
 * Owns the light/dark theme: toggles `.dark` on <html> and keeps the browser
 * chrome in sync. Auto-detects the OS preference and keeps following it live —
 * until you pick a theme yourself, which we persist and honor from then on.
 */
export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => savedTheme() ?? systemTheme());

  // Apply to the DOM. No persistence here on purpose: writing the auto-detected
  // value would lock it in and stop us from ever following the OS again.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#1a1613" : "#f5efe4");
  }, [theme]);

  // Track the OS while the user hasn't made an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      if (savedTheme() === null) setThemeState(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* no-op */
    }
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return { theme, toggle, setTheme };
}

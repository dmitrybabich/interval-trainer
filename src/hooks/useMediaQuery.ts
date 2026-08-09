import { useEffect, useState } from "react";

/** Reactive `matchMedia`: re-renders when the query starts/stops matching. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * True on a touch-primary device (no physical keyboard), so the on-key shortcut
 * hints are just noise. Combines the CSS pointer/hover media features with
 * `navigator.maxTouchPoints`: DevTools device emulation reliably sets the latter
 * but is flaky about the former, and real touch devices are caught by either.
 */
export function useIsTouch(): boolean {
  const coarseOrNoHover = useMediaQuery("(hover: none), (pointer: coarse)");
  const [hasTouchPoints] = useState(() => typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  return coarseOrNoHover || hasTouchPoints;
}

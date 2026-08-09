import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { SettingsSheet } from "@/components/SettingsSheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { Theme } from "@/hooks/useTheme";
import type { Prefs } from "@/lib/constants";
import { WARMUP_TRACKS } from "@/lib/warmupTracks";

interface Props {
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  savedRange: { lo: number; hi: number } | null;
  onCalibrate: () => void;
}

type Activity = "detector" | "intervals" | "warmup";

// The top-level activities the header switcher hops between. Deep screens
// (a running level, calibration) aren't here — they carry their own back button
// and hide the switcher entirely.
const ACTIVITY_PATHS: Record<Activity, string> = {
  detector: "/",
  intervals: "/intervals",
  warmup: `/warmup/${WARMUP_TRACKS[0].id}`,
};

function activityForPath(pathname: string): Activity | null {
  if (pathname === "/") return "detector";
  if (pathname.startsWith("/intervals")) return "intervals";
  if (pathname.startsWith("/warmup")) return "warmup";
  return null; // level / calibrate — no switcher
}

/**
 * The app shell every route renders inside: header with the title + settings
 * gear, the settings sheet, and the footer. Pages render through <Outlet/>, so
 * the chrome is defined once and works for any page — including bookmarked deep
 * links, since the shell has no route guards of its own.
 */
export function Layout({ prefs, setPref, theme, onThemeChange, savedRange, onCalibrate }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activity = activityForPath(location.pathname);
  const activityOptions = [
    { value: "detector" as const, label: t("nav.detector") },
    { value: "intervals" as const, label: t("nav.intervals") },
    { value: "warmup" as const, label: t("nav.warmup") },
  ];

  return (
    <div className="flex h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 py-3">
        {activity ? (
          <Segmented value={activity} options={activityOptions} onValueChange={(a) => navigate(ACTIVITY_PATHS[a])} />
        ) : (
          <h1 className="text-lg font-semibold tracking-tight">{t("app.title")}</h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          className="shrink-0 rounded-full text-muted-foreground"
          title={t("settings.title")}
        >
          <SlidersHorizontal className="size-5" />
        </Button>
      </header>

      <main className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        prefs={prefs}
        setPref={setPref}
        theme={theme}
        onThemeChange={onThemeChange}
        savedRange={savedRange}
        onCalibrate={() => {
          setSettingsOpen(false);
          onCalibrate();
        }}
      />
    </div>
  );
}

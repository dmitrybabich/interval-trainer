import { motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { SettingsSheet } from "@/components/SettingsSheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Theme } from "@/hooks/useTheme";
import type { Prefs } from "@/lib/constants";
import { WARMUP_TRACKS } from "@/lib/warmupTracks";

const ISSUES_URL = "https://github.com/dmitrybabich/interval-trainer/issues";

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

// GitHub's Octocat mark. Inline (not lucide's deprecated Github icon) so it stays
// monochrome via currentColor and never breaks on a brand-icon removal.
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
    </svg>
  );
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
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={ISSUES_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={t("app.reportIssue")}
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <GithubMark className="size-5" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("app.reportIssue")}</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            className="rounded-full text-muted-foreground"
            title={t("settings.title")}
          >
            <SlidersHorizontal className="size-5" />
          </Button>
        </div>
      </header>

      <main className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-1">
        <motion.div
          key={location.pathname}
          initial={{ y: 10 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          <Outlet />
        </motion.div>
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

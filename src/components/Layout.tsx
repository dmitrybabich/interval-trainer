import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";

import { SettingsSheet } from "@/components/SettingsSheet";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/hooks/useTheme";
import type { Prefs } from "@/lib/constants";

interface Props {
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  savedRange: { lo: number; hi: number } | null;
  onCalibrate: () => void;
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pb-2 pt-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("app.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          className="rounded-full text-muted-foreground"
          title={t("settings.title")}
        >
          <SlidersHorizontal className="size-5" />
        </Button>
      </header>

      <main className="w-full flex-1 px-4 pb-6 pt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mx-auto w-full max-w-xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground/70">
        <a
          href="https://github.com/ianprime0509/pitchy"
          target="_blank"
          rel="noopener"
          className="transition-colors hover:text-foreground"
        >
          {t("app.pitchCredit")}
        </a>
      </footer>

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

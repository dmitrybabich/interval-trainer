import { Mic } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface Props {
  ready: boolean;
  onStart: () => void;
  children: ReactNode;
  label?: string;
}

/**
 * Wraps content that needs the mic. The children always render (so the page is
 * bookmarkable and shows its static parts on a cold load), but until the mic is
 * live an overlay offers a tap target to grant it — browsers gate getUserMedia
 * behind a user gesture, so a fresh page load can't request it on its own.
 */
export function MicGate({ ready, onStart, children, label }: Props) {
  const { t } = useTranslation();
  return (
    <div className="relative size-full">
      {children}
      {!ready && (
        <div className="absolute inset-0 grid place-items-center rounded-2xl bg-background/60 backdrop-blur-sm">
          <Button onClick={onStart} className="gap-2">
            <Mic className="size-4" />
            {label ?? t("mic.enable")}
          </Button>
        </div>
      )}
    </div>
  );
}

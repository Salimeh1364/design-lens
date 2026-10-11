"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ImageIcon, LinkIcon } from "./icons";
import { ScreenshotDropzone } from "./screenshot-dropzone";
import { UrlCapture } from "./url-capture";
import { useLanguage } from "./language-provider";
import type { SourceKind } from "@/lib/types";
import type { AnalysisSource } from "@/types/analysis";

const TABS: SourceKind[] = ["screenshot", "url"];

type SourcePanelProps = {
  className?: string;
  /** Increments when the designer clears a finished review. */
  resetEpoch: number;
  onCritique: (request: AnalysisSource) => void;
};

export function SourcePanel({ className = "", resetEpoch, onCritique }: SourcePanelProps) {
  const { locale, t } = useLanguage();
  const [active, setActive] = useState<SourceKind>("screenshot");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  useEffect(() => {
    if (resetEpoch === 0) return;
    // Drop the preview URL and both inputs so the source area matches a
    // fresh visit. Local dropzone and URL errors remount with this epoch.
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setFile(null);
    setPreviewUrl(null);
    setWebsite("");
    setActive("screenshot");
  }, [resetEpoch]);

  function handleFileChange(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = next ? URL.createObjectURL(next) : null;
    previewRef.current = url;
    setFile(next);
    setPreviewUrl(url);
  }

  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.indexOf(active);
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const next =
      event.key === "Home"
        ? TABS[0]
        : event.key === "End"
          ? TABS[TABS.length - 1]
          : event.key === "ArrowRight"
            ? TABS[(index + 1) % TABS.length]
            : TABS[(index - 1 + TABS.length) % TABS.length];
    setActive(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  const tabCopy = {
    screenshot: { label: t.tabScreenshot, icon: ImageIcon },
    url: { label: t.tabUrl, icon: LinkIcon },
  };

  return (
    <section id="source" className={`scroll-mt-24 ${className}`}>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
        {t.sectionSource}
      </p>
      <div className="mt-3 overflow-hidden rounded-3xl border border-line bg-card shadow-[0_30px_70px_-42px_rgba(22,20,18,0.55)]">
        <div
          role="tablist"
          aria-label={t.tablistLabel}
          onKeyDown={onTabsKeyDown}
          className="grid grid-cols-2 gap-1 border-b border-line p-2"
        >
          {TABS.map((id) => {
            const selected = active === id;
            const Icon = tabCopy[id].icon;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(id)}
                className={`inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected ? "bg-ink text-paper" : "text-mute hover:text-ink"
                }`}
              >
                <Icon />
                {tabCopy[id].label}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-6">
          <div
            role="tabpanel"
            id={`panel-${active}`}
            aria-labelledby={`tab-${active}`}
          >
            {active === "screenshot" ? (
              <ScreenshotDropzone
                key={resetEpoch}
                file={file}
                previewUrl={previewUrl}
                onFileChange={handleFileChange}
                onCritique={(next) => {
                  // Drop, browse, and paste all hand over the same File.
                  // The page gives it to useAIAnalysis, which reads it as base64.
                  onCritique({ kind: "screenshot", label: next.name, file: next, locale });
                }}
              />
            ) : (
              <UrlCapture
                key={resetEpoch}
                value={website}
                onChange={setWebsite}
                onSubmit={(url) => {
                  // Submit passes the normalized public URL. The page sends it
                  // through useAIAnalysis; the server fetches the page.
                  onCritique({ kind: "url", label: url, url, locale });
                }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { AnalysisPanel } from "@/components/analysis-panel";
import { SiteHeader } from "@/components/site-header";
import { SourcePanel } from "@/components/source-panel";
import { useLanguage } from "@/components/language-provider";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import type { AnalysisSource } from "@/types/analysis";

/**
 * The form and the review share this page. Submit hands the source to
 * `useAIAnalysis`; the notes section below only displays what the hook returns.
 */
export default function Home() {
  const { locale, t } = useLanguage();
  const [request, setRequest] = useState<AnalysisSource | null>(null);
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const { status, stage, progress, result, error, analyze, reset } = useAIAnalysis();

  /** Stores the source, starts the review, and scrolls the notes into view. */
  function handleCritique(next: AnalysisSource) {
    // Step 1 — remember the source so the notes can name it and retry it.
    // A screenshot still carries the File. The hook encodes that file to
    // base64 before the request leaves the browser. A URL is forwarded as
    // the public address; the server captures the screen.
    setRequest(next);
    void analyze(next, locale);

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document.getElementById("critique")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  /** Drops the notes, cancels a late response, and resets the source form. */
  function clearReview() {
    // One step back to the empty page: drop the notes, cancel a late
    // response, and ask the source form to forget its file and URL.
    setRequest(null);
    reset();
    setSourceEpoch((epoch) => epoch + 1);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document.getElementById("source")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  /** Runs the same source again in the language currently on screen. */
  function retry() {
    if (!request) return;
    // Retry uses the language on screen now, which may differ from the
    // language of the original click.
    const next: AnalysisSource = { ...request, locale };
    setRequest(next);
    void analyze(next, locale);
  }

  return (
    <div id="top" className="studio-canvas flex min-h-full flex-1 flex-col text-ink">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pt-12 pb-16 sm:px-8 sm:pt-16">
        <div className="max-w-3xl">
          <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">
            {t.eyebrow}
          </p>
          <h1 className="mt-4 font-serif text-[2.75rem] leading-[1.02] tracking-tight sm:text-6xl">
            {t.headlineLead}
            <em className="text-accent">{t.headlineEmphasis}</em>
            {t.headlineTail}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-mute">
            {t.lede}
          </p>
        </div>

        <SourcePanel className="mt-12" resetEpoch={sourceEpoch} onCritique={handleCritique} />
        {/* Step 2–4 — skeleton while `status` is loading, the result card on
            success, and a translated alert when the API returns an error. */}
        <AnalysisPanel
          className="mt-8"
          request={request}
          status={status}
          stage={stage}
          progress={progress}
          result={result}
          error={error}
          onRetry={retry}
          onReset={clearReview}
        />
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-5xl px-5 py-6 text-sm text-mute sm:px-8">
          {t.footer}
        </p>
      </footer>
    </div>
  );
}

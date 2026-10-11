"use client";

import { AnalysisErrorBoundary } from "@/components/analysis/AnalysisErrorBoundary";
import { AnalysisResultCard } from "@/components/analysis/AnalysisResultCard";
import { LoadingSkeleton } from "@/components/analysis/LoadingSkeleton";
import { Button } from "@/components/button";
import { useLanguage } from "@/components/language-provider";
import { fillLabel, type Dictionary } from "@/lib/dictionary";
import {
  type AnalysisErrorBody,
  type AnalysisErrorCode,
  type AnalysisResult,
  type AnalysisSource,
  type AnalysisStage,
  type AnalysisStatus,
} from "@/types/analysis";

type AnalysisPanelProps = {
  className?: string;
  request: AnalysisSource | null;
  status: AnalysisStatus;
  stage: AnalysisStage;
  progress: number;
  result: AnalysisResult | null;
  error: AnalysisErrorBody | null;
  onRetry: () => void;
  onReset: () => void;
};

const STAGE_COPY: Record<AnalysisStage, keyof Dictionary> = {
  preparing: "progressPreparing",
  sending: "progressSending",
  reviewing: "progressReviewing",
  writing: "progressWriting",
};

const ERROR_COPY: Record<AnalysisErrorCode, keyof Dictionary> = {
  invalid_request: "errorInvalid",
  missing_key: "errorMissingKey",
  quota: "errorQuota",
  upstream: "errorUpstream",
  parse: "errorParse",
  network: "errorNetwork",
  page_unreachable: "errorPage",
  too_large: "errorTooLarge",
  aborted: "errorGeneric",
};

function statusLabel(status: AnalysisStatus, hasSource: boolean, t: Dictionary) {
  if (!hasSource) return t.statusIdle;
  if (status === "loading" || status === "idle") return t.statusAnalyzing;
  if (status === "success") return t.statusComplete;
  return t.statusFailed;
}

/**
 * Renders the review that the page already started. This panel does not call
 * the model. Loading, the finished card, and the error alert are chosen from
 * the hook state passed in from the form above.
 */
export function AnalysisPanel({
  className = "",
  request,
  status,
  stage,
  progress,
  result,
  error,
  onRetry,
  onReset,
}: AnalysisPanelProps) {
  const { t } = useLanguage();

  const facets = [t.facetHierarchy, t.facetContrast, t.facetSpacing, t.facetType];
  const sourceLabel = request?.kind === "screenshot" ? t.tabScreenshot : t.tabUrl;
  const waiting = request !== null && (status === "loading" || status === "idle");
  const intro = !request
    ? t.resultsEmptyBody
    : status === "error"
      ? fillLabel(t.analysisFailedBody, request.label)
      : status === "success"
        ? fillLabel(t.resultsReadyBody, request.label)
        : fillLabel(t.analysisReading, request.label);

  return (
    <section
      id="critique"
      aria-labelledby="critique-title"
      aria-busy={waiting || undefined}
      className={`scroll-mt-24 rounded-3xl border border-dashed border-ink/15 bg-card/80 p-5 sm:p-8 ${className}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
            {t.sectionNotes}
          </p>
          <h2
            id="critique-title"
            className="mt-3 font-serif text-4xl tracking-tight"
          >
            {t.resultsTitle}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "success" && result ? (
            <Button className="w-full sm:w-auto" onClick={onReset}>
              {t.resetReview}
            </Button>
          ) : null}
          <p className="w-fit rounded-full border border-line px-3 py-1 text-xs tracking-wide text-mute">
            {statusLabel(status, request !== null, t)}
          </p>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-base leading-7 text-mute">{intro}</p>

      {request ? (
        <p className="mt-3 truncate font-mono text-xs text-ink">
          {sourceLabel} · {request.label}
        </p>
      ) : (
        <p className="mt-3 font-serif text-2xl tracking-tight text-ink">
          {t.resultsEmpty}
        </p>
      )}

      {waiting ? (
        <LoadingSkeleton progress={progress} stageLabel={t[STAGE_COPY[stage]]} />
      ) : null}

      {status === "error" && error ? (
        <div
          role="alert"
          className="mt-8 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-4"
        >
          <p className="text-sm leading-6 text-ink">{t[ERROR_COPY[error.code]]}</p>
          <Button className="mt-4" variant="ghost" size="sm" onClick={onRetry}>
            {t.retry}
          </Button>
        </div>
      ) : null}

      {status === "success" && result ? (
        <AnalysisErrorBoundary
          resetKey={`${status}:${result.overallScore}:${result.summary}`}
          onRetry={onRetry}
        >
          <AnalysisResultCard result={result} />
        </AnalysisErrorBoundary>
      ) : null}

      {!request ? (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {facets.map((facet, index) => (
            <li
              key={facet}
              className="rounded-2xl border border-line bg-paper px-4 py-4"
            >
              <p className="font-mono text-[11px] tracking-[0.16em] text-mute">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-base font-medium">{facet}</h3>
              <p className="mt-1 text-sm text-mute">{t.facetPending}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

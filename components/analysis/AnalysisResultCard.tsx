"use client";

import { ScoreBadge } from "@/components/analysis/ScoreBadge";
import { useLanguage } from "@/components/language-provider";
import type { Dictionary } from "@/lib/dictionary";
import {
  SCORE_DIMENSIONS,
  type AnalysisResult,
  type ScoreDimension,
  type Severity,
} from "@/types/analysis";

/** Axis id to the localized facet name. */
const SCORE_LABEL: Record<ScoreDimension, keyof Dictionary> = {
  visualHierarchy: "facetHierarchy",
  contrast: "facetContrast",
  spacing: "facetSpacing",
  typography: "facetType",
};

/** Severity to the localized chip label. */
const SEVERITY_LABEL: Record<Severity, keyof Dictionary> = {
  high: "severityHigh",
  medium: "severityMedium",
  low: "severityLow",
};

/** Chip colors. High uses the accent; medium and low stay on the paper background. */
const SEVERITY_CLASS: Record<Severity, string> = {
  high: "border-accent/40 bg-accent-soft text-accent",
  medium: "border-severity-medium bg-paper text-ink",
  low: "border-severity-low bg-paper text-mute",
};

type AnalysisResultCardProps = {
  result: AnalysisResult;
};

/**
 * Renders a finished review: overall score, the four axes, then each note
 * with feedback, a recommendation, and the evidence behind it.
 */
export function AnalysisResultCard({ result }: AnalysisResultCardProps) {
  const { t } = useLanguage();

  // Keep the four axes in contract order even if the model returned them differently.
  const orderedScores = SCORE_DIMENSIONS.flatMap((id) => {
    const score = result.scores.find((item) => item.id === id);
    return score ? [score] : [];
  });

  return (
    <div className="mt-8 flex flex-col gap-3">
      <ScoreBadge
        emphasis
        label={t.overallLabel}
        score={result.overallScore}
        summary={result.summary}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {orderedScores.map((score) => (
          <ScoreBadge
            key={score.id}
            label={t[SCORE_LABEL[score.id]]}
            score={score.score}
            summary={score.summary}
          />
        ))}
      </div>

      <ol className="mt-3 flex flex-col gap-3">
        {result.critiques.map((item, index) => (
          <li
            key={`${item.title}-${index}`}
            className="rounded-2xl border border-line bg-paper px-4 py-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[11px] tracking-[0.16em] text-mute">
                {String(index + 1).padStart(2, "0")}
              </p>
              <span
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-[0.14em] uppercase ${SEVERITY_CLASS[item.severity]}`}
              >
                {t[SEVERITY_LABEL[item.severity]]}
              </span>
            </div>
            <h3 className="mt-3 text-base font-medium">{item.title}</h3>

            <h4 className="mt-4 font-mono text-[11px] tracking-[0.16em] text-mute uppercase">
              {t.feedbackLabel}
            </h4>
            <p className="mt-1 text-sm leading-6 text-ink">{item.feedback}</p>

            <h4 className="mt-4 font-mono text-[11px] tracking-[0.16em] text-mute uppercase">
              {t.recommendationLabel}
            </h4>
            <p className="mt-1 text-sm leading-6 text-ink">{item.recommendation}</p>

            <h4 className="mt-4 font-mono text-[11px] tracking-[0.16em] text-mute uppercase">
              {t.evidenceLabel}
            </h4>
            <ul className="mt-2 flex flex-col gap-2">
              {item.evidence.map((entry) => (
                <li key={`${entry.location}-${entry.observation}`} className="text-sm leading-6">
                  <p className="text-ink">{entry.observation}</p>
                  <p className="text-mute">{entry.location}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

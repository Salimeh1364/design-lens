import {
  ANALYSIS_ERROR_CODES,
  SCORE_DIMENSIONS,
  SEVERITIES,
  type AnalysisErrorBody,
  type AnalysisErrorCode,
  type AnalysisResult,
  type CritiqueItem,
  type DimensionScore,
  type Evidence,
  type ImageMimeType,
  type ScoreDimension,
  type Severity,
  IMAGE_MIME_TYPES,
} from "@/types/analysis";

/**
 * Runtime checks for JSON that crossed the network.
 * The hook uses these so a 200 with an unexpected body cannot crash the view.
 * This file is imported by client components — keep it free of Node and the AI SDK.
 *
 * این بررسی‌ها برای JSONی است که از شبکه آمده.
 * اگر پاسخ ۲۰۰ شکل مورد انتظار را نداشته باشد، نما نباید بشکند.
 * این فایل در کلاینت هم وارد می‌شود؛ Node و AI SDK را اینجا وارد نکنید.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function isImageMimeType(value: string): value is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

function isScoreDimension(value: unknown): value is ScoreDimension {
  return (
    typeof value === "string" &&
    (SCORE_DIMENSIONS as readonly string[]).includes(value)
  );
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

function isErrorCode(value: unknown): value is AnalysisErrorCode {
  return (
    typeof value === "string" &&
    (ANALYSIS_ERROR_CODES as readonly string[]).includes(value)
  );
}

function isEvidence(value: unknown): value is Evidence {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.observation, 500) && isBoundedString(value.location, 200)
  );
}

function isDimensionScore(value: unknown): value is DimensionScore {
  if (!isRecord(value)) return false;
  return (
    isScoreDimension(value.id) &&
    isScore(value.score) &&
    isBoundedString(value.summary, 600)
  );
}

function isCritiqueItem(value: unknown): value is CritiqueItem {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.title, 160)) return false;
  if (!isSeverity(value.severity)) return false;
  if (!isBoundedString(value.feedback, 900)) return false;
  if (!isBoundedString(value.recommendation, 900)) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) return false;
  if (value.evidence.length > 4) return false;
  return value.evidence.every(isEvidence);
}

export function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value)) return false;
  if (!isScore(value.overallScore)) return false;
  if (!isBoundedString(value.summary, 1000)) return false;
  if (!Array.isArray(value.scores) || !Array.isArray(value.critiques)) return false;
  if (value.critiques.length < 1 || value.critiques.length > 6) return false;
  if (!value.scores.every(isDimensionScore)) return false;
  if (!value.critiques.every(isCritiqueItem)) return false;

  // Every axis must appear once. A missing score would render a hole in the grid.
  // هر محور باید دقیقاً یک بار باشد تا در شبکهٔ نمره‌ها جای خالی نماند.
  const seen = new Set(value.scores.map((score) => score.id));
  return SCORE_DIMENSIONS.every((id) => seen.has(id)) && seen.size === SCORE_DIMENSIONS.length;
}

export function isAnalysisErrorBody(value: unknown): value is AnalysisErrorBody {
  if (!isRecord(value)) return false;
  return isErrorCode(value.code) && typeof value.message === "string";
}

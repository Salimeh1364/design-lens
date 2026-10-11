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
 */

/** True for a plain object. Arrays are records in JS, and they are not the shapes we check. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty string within the same length the server schema allows. */
function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

/** A finite number from 0 to 100. NaN would otherwise pass a `typeof` check. */
function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

/** True when the file input reports a type the dropzone and the model both accept. */
export function isImageMimeType(value: string): value is ImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/** One of the four scored axes. */
function isScoreDimension(value: unknown): value is ScoreDimension {
  return (
    typeof value === "string" &&
    (SCORE_DIMENSIONS as readonly string[]).includes(value)
  );
}

/** high, medium, or low. */
function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

/** One of the codes the notes panel knows how to translate. */
function isErrorCode(value: unknown): value is AnalysisErrorCode {
  return (
    typeof value === "string" &&
    (ANALYSIS_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** A single observation and the place on the screen it refers to. */
function isEvidence(value: unknown): value is Evidence {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.observation, 500) && isBoundedString(value.location, 200)
  );
}

/** One axis score: id, a 0–100 number, and a short summary. */
function isDimensionScore(value: unknown): value is DimensionScore {
  if (!isRecord(value)) return false;
  return (
    isScoreDimension(value.id) &&
    isScore(value.score) &&
    isBoundedString(value.summary, 600)
  );
}

/** One note: title, severity, feedback, recommendation, and one to four pieces of evidence. */
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

/** True when `value` is the critique object the notes panel renders. */
export function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value)) return false;
  if (!isScore(value.overallScore)) return false;
  if (!isBoundedString(value.summary, 1000)) return false;
  if (!Array.isArray(value.scores) || !Array.isArray(value.critiques)) return false;
  if (value.critiques.length < 1 || value.critiques.length > 6) return false;
  if (!value.scores.every(isDimensionScore)) return false;
  if (!value.critiques.every(isCritiqueItem)) return false;

  // Every axis must appear once. A missing score would render a hole in the grid.
  const seen = new Set(value.scores.map((score) => score.id));
  return SCORE_DIMENSIONS.every((id) => seen.has(id)) && seen.size === SCORE_DIMENSIONS.length;
}

/** True when the route returned the shared error envelope. */
export function isAnalysisErrorBody(value: unknown): value is AnalysisErrorBody {
  if (!isRecord(value)) return false;
  return isErrorCode(value.code) && typeof value.message === "string";
}

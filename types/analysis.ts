import type { Locale } from "@/lib/types";

/**
 * Shared contract for a design review.
 * The browser sends `AnalysisRequest`. The server answers with `AnalysisResult`
 * or `AnalysisErrorBody`. Neither shape carries an API key.
 */

/** Languages the model is asked to write in. Matches the UI locale. */
export type AnalysisLocale = Locale;

/** Screenshot formats the dropzone and the vision model both accept. */
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/** Same 10 MB ceiling the dropzone already shows in the UI. */
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

/**
 * Base64 expands a file by about 4/3. 14_000_000 characters covers a 10 MB
 * image plus padding, and gives the route a hard cap before the model call.
 */
export const MAX_IMAGE_BASE64_CHARS = 14_000_000;

/**
 * Review axes shown as scores. Actionable feedback and evidence are not
 * scores — they live on each critique item.
 */
export const SCORE_DIMENSIONS = [
  "visualHierarchy",
  "contrast",
  "spacing",
  "typography",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export type DimensionScore = {
  id: ScoreDimension;
  /** Whole number from 0 to 100. 100 is a confident pass on that axis. */
  score: number;
  /** One or two sentences on why this axis landed where it did. */
  summary: string;
};

/** Something the model can actually point at on the screen or in the page. */
export type Evidence = {
  observation: string;
  /** Where it sits, such as "primary button in the header". */
  location: string;
};

export const SEVERITIES = ["high", "medium", "low"] as const;

export type Severity = (typeof SEVERITIES)[number];

/**
 * One review note. `feedback` names the problem, `recommendation` is the
 * change to make, and `evidence` is the proof.
 */
export type CritiqueItem = {
  title: string;
  severity: Severity;
  feedback: string;
  recommendation: string;
  evidence: Evidence[];
};

export type AnalysisResult = {
  overallScore: number;
  summary: string;
  scores: DimensionScore[];
  critiques: CritiqueItem[];
};

/**
 * What the designer picked in the source panel. The file stays in memory
 * until the hook turns it into base64. The URL is the public address.
 */
export type AnalysisSource =
  | {
      kind: "screenshot";
      label: string;
      file: File;
      /** Language selected when the designer asked for the review. */
      locale: AnalysisLocale;
    }
  | {
      kind: "url";
      label: string;
      url: string;
      /** Language selected when the designer asked for the review. */
      locale: AnalysisLocale;
    };

/** JSON body posted to `/api/analyze`. */
export type AnalysisRequest =
  | {
      kind: "screenshot";
      label: string;
      imageBase64: string;
      mimeType: ImageMimeType;
      locale: AnalysisLocale;
    }
  | {
      kind: "url";
      label: string;
      url: string;
      locale: AnalysisLocale;
    };

export const ANALYSIS_ERROR_CODES = [
  "invalid_request",
  "missing_key",
  "quota",
  "upstream",
  "parse",
  "network",
  "page_unreachable",
  "too_large",
  "aborted",
  "timeout",
] as const;

export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number];

export type AnalysisErrorBody = {
  code: AnalysisErrorCode;
  /** Safe, short English fallback. The UI prefers the localized string for `code`. */
  message: string;
};

/** Client-side phase labels. These describe the wait, not bytes from the model. */
export const ANALYSIS_STAGES = [
  "preparing",
  "sending",
  "reviewing",
  "writing",
] as const;

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export type AnalysisStatus = "idle" | "loading" | "success" | "error";

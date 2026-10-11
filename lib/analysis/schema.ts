import { z } from "zod";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BASE64_CHARS,
  SCORE_DIMENSIONS,
  SEVERITIES,
  type AnalysisRequest,
  type AnalysisResult,
  type ScoreDimension,
} from "@/types/analysis";

/**
 * Two schemas with different jobs:
 * - `analysisResultSchema` is handed to the model, so it stays free of
 *   transforms. Providers turn it into JSON Schema.
 * - `parseAnalysisRequest` checks the browser payload before any model call.
 */

/**
 * Pieces of the critique object. Length limits match the checks in `guards.ts`,
 * so a value the model is allowed to emit is a value the client can render.
 */
const evidenceSchema = z.object({
  observation: z.string().min(1).max(500),
  location: z.string().min(1).max(200),
});

const dimensionScoreSchema = z.object({
  id: z.enum(SCORE_DIMENSIONS),
  score: z.number().min(0).max(100),
  summary: z.string().min(1).max(600),
});

const critiqueSchema = z.object({
  title: z.string().min(1).max(160),
  severity: z.enum(SEVERITIES),
  feedback: z.string().min(1).max(900),
  recommendation: z.string().min(1).max(900),
  evidence: z.array(evidenceSchema).min(1).max(4),
});

/** Shape Gemini must return. Kept free of transforms so it can become JSON Schema. */
export const analysisResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string().min(1).max(1000),
  scores: z.array(dimensionScoreSchema).length(SCORE_DIMENSIONS.length),
  critiques: z.array(critiqueSchema).min(2).max(6),
});

/** Standard base64, with optional padding. Whitespace is removed before this runs. */
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

const analysisRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("screenshot"),
    label: z.string().min(1).max(240),
    imageBase64: z.string().min(32).max(MAX_IMAGE_BASE64_CHARS).regex(base64Pattern),
    mimeType: z.enum(IMAGE_MIME_TYPES),
    locale: z.enum(["en", "de"]),
  }),
  z.object({
    kind: z.literal("url"),
    label: z.string().min(1).max(2000),
    url: z.string().min(8).max(2000),
    locale: z.enum(["en", "de"]),
  }),
]);

export type ModelAnalysisResult = z.infer<typeof analysisResultSchema>;

const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set(["$schema", "minLength", "maxLength"]);

/**
 * Gemini accepts a subset of JSON Schema. Zod's draft adds `$schema` and
 * string lengths, which that subset rejects, so those keys are removed and
 * each object records its property order.
 */
export function analysisResultJsonSchema(): unknown {
  return toGeminiSchema(analysisResultSchema.toJSONSchema());
}

/** Walks a JSON Schema and drops keys Gemini rejects, then records property order on each object. */
function toGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiSchema);
  if (typeof value !== "object" || value === null) return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    result[key] = toGeminiSchema(child);
  }

  if (
    result.type === "object" &&
    typeof result.properties === "object" &&
    result.properties !== null &&
    !Array.isArray(result.properties)
  ) {
    // Gemini uses this order when it fills the object. The UI expects the four axes in SCORE_DIMENSIONS order.
    result.propertyOrdering = Object.keys(result.properties);
  }

  return result;
}

/** True for a plain object. Arrays are excluded because a JSON array is not a request body. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * FileReader posts a data URL. The model wants the raw base64 payload and a
 * separate media type. A mismatched type inside the data URL is rejected.
 */
function normalizeScreenshotBody(input: unknown): unknown {
  if (!isRecord(input) || input.kind !== "screenshot") return input;
  if (typeof input.imageBase64 !== "string") return input;

  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(input.imageBase64.trim());
  const embeddedMime = match?.[1]?.toLowerCase() ?? null;
  const data = (match ? match[2] : input.imageBase64).replace(/\s/g, "");
  const declaredMime = typeof input.mimeType === "string" ? input.mimeType : null;

  if (embeddedMime && declaredMime && embeddedMime !== declaredMime) {
    return { kind: "screenshot" };
  }

  return {
    ...input,
    imageBase64: data,
    mimeType: declaredMime ?? embeddedMime,
  };
}

/** True for http and https URLs. Host safety is checked again in the route before capture. */
function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type RequestParseResult =
  | { ok: true; request: AnalysisRequest }
  | { ok: false; reason: "invalid" | "too_large" };

/**
 * Validates the JSON body from the browser.
 * An oversized screenshot is reported separately from a malformed body so the
 * route can answer 413 instead of 400. A data-URL prefix is stripped first.
 */
export function parseAnalysisRequest(input: unknown): RequestParseResult {
  if (
    isRecord(input) &&
    input.kind === "screenshot" &&
    typeof input.imageBase64 === "string" &&
    input.imageBase64.length > MAX_IMAGE_BASE64_CHARS
  ) {
    return { ok: false, reason: "too_large" };
  }

  const parsed = analysisRequestSchema.safeParse(normalizeScreenshotBody(input));
  if (!parsed.success) return { ok: false, reason: "invalid" };

  if (parsed.data.kind === "screenshot") {
    const label = parsed.data.label.trim();
    if (!label) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      request: {
        kind: "screenshot",
        label,
        imageBase64: parsed.data.imageBase64,
        mimeType: parsed.data.mimeType,
        locale: parsed.data.locale,
      },
    };
  }

  const label = parsed.data.label.trim();
  const url = parsed.data.url.trim();
  if (!label || !isPublicHttpUrl(url)) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    request: {
      kind: "url",
      label,
      url,
      locale: parsed.data.locale,
    },
  };
}

/** Trims a model string and rejects empty or over-long text. */
function requiredText(value: string, max: number): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/** Scores are whole numbers from 0 to 100. The model sometimes returns a float. */
function roundScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * The model schema allows a valid shape that is still useless, such as a
 * duplicated axis or a whitespace-only note. This folds the object into the
 * exact `AnalysisResult` the UI renders, or returns null so the route can
 * answer with a parse error instead of a half review.
 */
export function finalizeAnalysisResult(value: ModelAnalysisResult): AnalysisResult | null {
  const summary = requiredText(value.summary, 1000);
  if (!summary) return null;

  const byId = new Map<ScoreDimension, { score: number; summary: string }>();
  for (const score of value.scores) {
    if (byId.has(score.id)) return null;
    const text = requiredText(score.summary, 600);
    if (!text) return null;
    byId.set(score.id, { score: roundScore(score.score), summary: text });
  }

  const scores = SCORE_DIMENSIONS.map((id) => {
    const score = byId.get(id);
    return score ? { id, score: score.score, summary: score.summary } : null;
  });
  if (scores.some((score) => score === null)) return null;

  const critiques = [];
  for (const item of value.critiques) {
    const title = requiredText(item.title, 160);
    const feedback = requiredText(item.feedback, 900);
    const recommendation = requiredText(item.recommendation, 900);
    if (!title || !feedback || !recommendation) return null;

    const evidence = [];
    for (const entry of item.evidence) {
      const observation = requiredText(entry.observation, 500);
      const location = requiredText(entry.location, 200);
      if (!observation || !location) return null;
      evidence.push({ observation, location });
    }

    critiques.push({
      title,
      severity: item.severity,
      feedback,
      recommendation,
      evidence,
    });
  }

  return {
    overallScore: roundScore(value.overallScore),
    summary,
    scores: scores.filter((score): score is NonNullable<typeof score> => score !== null),
    critiques,
  };
}

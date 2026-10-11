import { ApiError, GoogleGenAI, MediaResolution, ThinkingLevel, type ThinkingConfig } from "@google/genai";
import { capturePublicScreenshot, compressImageBase64 } from "@/lib/analysis/capture-page";
import { isObviouslyBlockedUrl, PageFetchError } from "@/lib/analysis/fetch-page";
import { buildScreenshotPrompt, buildSystemPrompt, buildUrlPrompt } from "@/lib/analysis/prompt";
import { analysisError } from "@/lib/analysis/respond";
import {
  analysisResultJsonSchema,
  analysisResultSchema,
  finalizeAnalysisResult,
  parseAnalysisRequest,
} from "@/lib/analysis/schema";
import type { AnalysisRequest, AnalysisResult } from "@/types/analysis";

/**
 * Server-only review endpoint.
 * The browser posts a screenshot or a URL. The Gemini key stays in this process.
 *
 * Required env: GEMINI_API_KEY
 * Optional env: GEMINI_MODEL (default gemini-3.5-flash-lite, which can read images)
 */

/** Puppeteer and sharp need Node. Reviews are uncached and may run for up to two minutes. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Flash-Lite is the everyday model: the free plan allows about 500 reviews a day.
 * Gemini 3.8 Flash is capped at about 20 free reviews a day, which is why a few
 * tests used to stop the whole app.
 */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
/** Tried, in order, when the chosen model has used up its free daily allowance. */
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;
/** Rejects a declared body before it is parsed. Base64 makes a 10 MB image larger than 10 MB of JSON. */
const MAX_BODY_BYTES = 16_000_000;

/** Uses GEMINI_MODEL when it looks like a model id, otherwise the default vision model. */
function resolveModelId(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  if (configured && /^[a-zA-Z0-9._:-]{1,80}$/.test(configured)) return configured;
  return DEFAULT_MODEL;
}

/** The configured model first, then other free models that can still take a review. */
function modelsToTry(): string[] {
  const models = [resolveModelId()];
  for (const model of FALLBACK_MODELS) {
    if (!models.includes(model)) models.push(model);
  }
  return models;
}

/** Logs the error name and HTTP status only, so keys and page contents stay out of the log. */
function logFailure(error: unknown) {
  const name = error instanceof Error ? error.name : "unknown";
  const status = error instanceof ApiError ? error.status : undefined;
  console.error("analyze_failed", { name, status });
}

/** True when the designer cancelled the request or the HTTP call was aborted. */
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** The uploaded image could not be decoded or resized. */
class ImagePrepareError extends Error {
  constructor() {
    super("The screenshot could not be prepared.");
    this.name = "ImagePrepareError";
  }
}

/** The model returned text that is not the critique object the UI can render. */
class ReviewShapeError extends Error {
  constructor() {
    super("The review came back in an unexpected shape.");
    this.name = "ReviewShapeError";
  }
}

/** Gemini refused the server key. Distinct from a missing key, which is checked before the call. */
function isRejectedKey(error: ApiError): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    /API_KEY_INVALID|API key not valid|permission denied/i.test(error.message)
  );
}

/** The project is over its request quota. Status 429 is the usual signal; some responses only say so in the message. */
function isRateLimited(error: ApiError): boolean {
  return (
    error.status === 429 ||
    /RESOURCE_EXHAUSTED|RATE_LIMIT|rate limit|quota exceeded|too many requests/i.test(error.message)
  );
}

/** Google's deadline or our HTTP timeout elapsed before a critique came back. */
function isUpstreamTimeout(error: ApiError): boolean {
  return (
    error.status === 408 ||
    error.status === 504 ||
    /DEADLINE_EXCEEDED|ETIMEDOUT|timed out|timeout/i.test(error.message)
  );
}

/**
 * Hidden reasoning makes a review miss Google's deadline and come back as
 * a 504. Flash 2.5 can turn thinking off. Gemini 3 keeps a minimal budget.
 */
function thinkingConfig(model: string): ThinkingConfig | undefined {
  if (/^gemini-2\.5-flash(?:-lite)?$/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  return undefined;
}

/**
 * Builds the JPEG Gemini will see.
 * A screenshot is resized on the server even if the browser already scaled it.
 * A URL is captured with a six-second deadline, then compressed the same way.
 */
async function prepareImage(
  request: AnalysisRequest,
  signal: AbortSignal,
): Promise<{ mimeType: "image/jpeg"; data: string }> {
  if (request.kind === "screenshot") {
    try {
      return { mimeType: "image/jpeg", data: await compressImageBase64(request.imageBase64) };
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new ImagePrepareError();
    }
  }

  try {
    return { mimeType: "image/jpeg", data: await capturePublicScreenshot(request.url, signal) };
  } catch (error) {
    if (isAbort(error) || error instanceof PageFetchError) throw error;
    throw new PageFetchError("unreachable");
  }
}

/**
 * Sends one review to Gemini and returns the critique the notes panel can render.
 * Both paths send a JPEG no wider than 1280px. A URL is captured first.
 * A failure here is thrown so POST can turn it into a message the notes panel shows.
 */
async function review(request: AnalysisRequest, signal: AbortSignal): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError({ status: 401, message: "GEMINI_API_KEY is missing." });
  }

  const image = await prepareImage(request, signal);
  const prompt =
    request.kind === "screenshot"
      ? buildScreenshotPrompt(request.label)
      : buildUrlPrompt(request.label);

  // Medium media resolution keeps the image tokens small enough to finish in time.
  const parts = [
    { text: prompt },
    { inlineData: image },
  ];

  const ai = new GoogleGenAI({ apiKey });
  let lastRateLimit: ApiError | undefined;

  for (const model of modelsToTry()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: buildSystemPrompt(request.locale),
          temperature: 0.3,
          maxOutputTokens: 2500,
          responseMimeType: "application/json",
          responseJsonSchema: analysisResultJsonSchema(),
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
          thinkingConfig: thinkingConfig(model),
          abortSignal: signal,
          httpOptions: {
            // This value is sent to Gemini as the server deadline. A screenshot
            // review needs more than the 50s that was returning 504.
            timeout: 90_000,
            retryOptions: { attempts: 1 },
          },
        },
      });

      // Structured output is still a string. An empty body or invalid JSON is a shape error, not a success.
      const text = response.text;
      if (!text) throw new ReviewShapeError();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ReviewShapeError();
      }

      const checked = analysisResultSchema.safeParse(parsed);
      if (!checked.success) throw new ReviewShapeError();

      const result = finalizeAnalysisResult(checked.data);
      if (!result) throw new ReviewShapeError();
      return result;
    } catch (error) {
      if (error instanceof ApiError && isRateLimited(error)) {
        lastRateLimit = error;
        continue;
      }
      throw error;
    }
  }

  throw lastRateLimit ?? new ApiError({ status: 429, message: "quota exceeded" });
}

/**
 * POST /api/analyze
 * Checks the body, refuses private addresses, then maps capture and Gemini
 * failures onto the error codes the notes panel translates.
 * A client abort is handled before a model timeout, and a page-capture
 * failure is handled before a Gemini failure.
 */
export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return analysisError(413, "too_large", "That screenshot is too large to review.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (isAbort(error)) {
      return analysisError(499, "aborted", "The review was cancelled.");
    }
    return analysisError(400, "invalid_request", "The review request could not be read.");
  }

  const parsed = parseAnalysisRequest(body);
  if (!parsed.ok) {
    return parsed.reason === "too_large"
      ? analysisError(413, "too_large", "That screenshot is too large to review.")
      : analysisError(400, "invalid_request", "The review request was missing a screenshot or a public URL.");
  }

  if (parsed.request.kind === "url" && isObviouslyBlockedUrl(parsed.request.url)) {
    return analysisError(400, "invalid_request", "That address cannot be reviewed.");
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return analysisError(
      503,
      "missing_key",
      "Analysis is not configured. Add GEMINI_API_KEY on the server.",
    );
  }

  try {
    const result = await review(parsed.request, request.signal);
    return Response.json(result);
  } catch (error) {
    if (isAbort(error)) {
      if (request.signal.aborted) {
        return analysisError(499, "aborted", "The review was cancelled.");
      }
      return analysisError(
        504,
        "timeout",
        "The review timed out before it could finish. Wait a moment and try again.",
      );
    }

    if (error instanceof PageFetchError) {
      if (error.reason === "too_large") {
        return analysisError(413, "too_large", "That page is too large to read.");
      }
      if (error.reason === "timeout") {
        return analysisError(
          422,
          "page_unreachable",
          "That page did not respond in time. Try again in a moment, or upload a screenshot instead.",
        );
      }
      if (error.reason === "unreachable") {
        return analysisError(
          422,
          "page_unreachable",
          "That page could not be reached. Check that it is public, or upload a screenshot instead.",
        );
      }
      return analysisError(400, "invalid_request", "That address cannot be reviewed.");
    }

    if (error instanceof ImagePrepareError) {
      logFailure(error);
      return analysisError(
        400,
        "invalid_request",
        "That screenshot could not be prepared. Try a PNG, JPG, or WebP.",
      );
    }

    if (error instanceof ReviewShapeError) {
      logFailure(error);
      return analysisError(502, "parse", "The review came back in an unexpected shape.");
    }

    if (error instanceof ApiError) {
      logFailure(error);
      if (isRejectedKey(error)) {
        return analysisError(503, "missing_key", "The analysis key was rejected.");
      }
      if (isRateLimited(error)) {
        return analysisError(
          429,
          "quota",
          "Today's free reviews are used up. Try again tomorrow.",
        );
      }
      if (isUpstreamTimeout(error)) {
        return analysisError(
          504,
          "timeout",
          "The review timed out before it could finish. Wait a moment and try again.",
        );
      }
      return analysisError(502, "upstream", "The review service did not respond.");
    }

    logFailure(error);
    return analysisError(500, "upstream", "The review could not be completed.");
  }
}

import { ApiError, GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai";
import { isObviouslyBlockedUrl, PageFetchError, readPublicPage } from "@/lib/analysis/fetch-page";
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
 * نقطهٔ ورود نقد، فقط روی سرور.
 * مرورگر اسکرین‌شات یا URL می‌فرستد و کلید Gemini در همین فرایند می‌ماند.
 *
 * Required env: GEMINI_API_KEY
 * Optional env: GEMINI_MODEL (default gemini-3.8-flash, which can read images)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_MODEL = "gemini-3.8-flash";
const MAX_BODY_BYTES = 16_000_000;

function resolveModelId(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  if (configured && /^[a-zA-Z0-9._:-]{1,80}$/.test(configured)) return configured;
  return DEFAULT_MODEL;
}

function logFailure(error: unknown) {
  const name = error instanceof Error ? error.name : "unknown";
  const status = error instanceof ApiError ? error.status : undefined;
  console.error("analyze_failed", { name, status });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** The model returned text that is not the critique object the UI can render. */
class ReviewShapeError extends Error {
  constructor() {
    super("The review came back in an unexpected shape.");
    this.name = "ReviewShapeError";
  }
}

function isRejectedKey(error: ApiError): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    /API_KEY_INVALID|API key not valid|permission denied/i.test(error.message)
  );
}

/**
 * Hidden reasoning makes a review miss Google's deadline and come back as
 * a 504. Flash 2.5 can turn thinking off. Gemini 3 keeps a minimal budget.
 *
 * استدلال پنهان نقد را از مهلت گوگل رد می‌کند و ۵۰۴ برمی‌گردد.
 * فلش ۲٫۵ می‌تواند آن را خاموش کند. جمینی ۳ فقط بودجهٔ کم را نگه می‌دارد.
 */
function thinkingConfig(model: string): ThinkingConfig | undefined {
  if (/^gemini-2\.5-flash(?:-lite)?$/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  return undefined;
}

async function review(request: AnalysisRequest, signal: AbortSignal): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError({ status: 401, message: "GEMINI_API_KEY is missing." });
  }

  const outline =
    request.kind === "url" ? await readPublicPage(request.url, signal) : null;
  const prompt =
    request.kind === "screenshot"
      ? buildScreenshotPrompt(request.label)
      : buildUrlPrompt(request.label, outline ?? "");

  // A screenshot is an inline image part. A URL review is text only: the
  // server already fetched a public outline and the model never sees the URL.
  // اسکرین‌شات یک بخش تصویری است. نقد URL فقط متن است؛ مدل خودِ نشانی را نمی‌بیند.
  const parts =
    request.kind === "screenshot"
      ? [
          { text: prompt },
          { inlineData: { mimeType: request.mimeType, data: request.imageBase64 } },
        ]
      : [{ text: prompt }];

  const model = resolveModelId();
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: buildSystemPrompt(request.locale),
      temperature: 0.3,
      maxOutputTokens: 2500,
      responseMimeType: "application/json",
      responseJsonSchema: analysisResultJsonSchema(),
      thinkingConfig: thinkingConfig(model),
      abortSignal: signal,
      httpOptions: {
        // This value is sent to Gemini as the server deadline. A screenshot
        // review needs more than the 50s that was returning 504.
        // این مقدار مهلت سرور جمینی است. نقد اسکرین‌شات بیشتر از ۵۰ ثانیه طول می‌کشد.
        timeout: 90_000,
        retryOptions: { attempts: 1 },
      },
    },
  });

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
}

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
      return analysisError(499, "aborted", "The review was cancelled.");
    }

    if (error instanceof PageFetchError) {
      if (error.reason === "too_large") {
        return analysisError(413, "too_large", "That page is too large to read.");
      }
      if (error.reason === "unreachable") {
        return analysisError(422, "page_unreachable", "That page could not be read.");
      }
      return analysisError(400, "invalid_request", "That address cannot be reviewed.");
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
      if (error.status === 429) {
        return analysisError(402, "quota", "We're receiving a high volume of requests right now. Please wait a moment and try your review again.");
      }
      return analysisError(502, "upstream", "The review service did not respond.");
    }

    logFailure(error);
    return analysisError(500, "upstream", "The review could not be completed.");
  }
}

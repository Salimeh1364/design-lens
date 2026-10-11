"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAnalysisErrorBody, isAnalysisResult, isImageMimeType } from "@/lib/analysis/guards";
import type { Locale } from "@/lib/types";
import {
  MAX_IMAGE_BASE64_CHARS,
  MAX_SCREENSHOT_BYTES,
  type AnalysisErrorBody,
  type AnalysisRequest,
  type AnalysisResult,
  type AnalysisSource,
  type AnalysisStage,
  type AnalysisStatus,
  type ImageMimeType,
} from "@/types/analysis";

/**
 * Owns the review lifecycle for one screen: idle, loading, success, error.
 *
 * Progress is a client-side clock. The model returns a single JSON payload,
 * so the bar moves through phases while the request is open. It is not a
 * byte count. A newer review or an unmount aborts the previous fetch.
 */

type UseAIAnalysisResult = {
  status: AnalysisStatus;
  stage: AnalysisStage;
  progress: number;
  result: AnalysisResult | null;
  error: AnalysisErrorBody | null;
  analyze: (source: AnalysisSource, locale: Locale) => Promise<void>;
  reset: () => void;
};

const STAGE_MARKS: { stage: AnalysisStage; progress: number }[] = [
  { stage: "preparing", progress: 18 },
  { stage: "sending", progress: 42 },
  { stage: "reviewing", progress: 68 },
  { stage: "writing", progress: 88 },
];

/** Longest edge drawn in the browser before the file is posted. The server resizes again to the same width. */
const SCREENSHOT_MAX_EDGE = 1280;
const CLIENT_JPEG_QUALITY = 0.8;

/** Reads a data URL and returns only the base64 payload after the comma. */
function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("unreadable"));
        return;
      }
      const comma = reader.result.indexOf(",");
      resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("unreadable"));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * A full-resolution screenshot makes Gemini miss its deadline. The longest
 * edge is drawn down to 1280px and saved as an 80% JPEG before it is posted.
 * If the browser cannot draw it within eight seconds, the caller sends the original file.
 */
function shrinkScreenshot(
  file: File,
): Promise<{ base64: string; mimeType: ImageMimeType }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    }, 8_000);
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    image.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      const longest = Math.max(image.width, image.height);
      const scale = longest > SCREENSHOT_MAX_EDGE ? SCREENSHOT_MAX_EDGE / longest : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("unreadable"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("unreadable"));
            return;
          }
          readFileAsBase64(blob).then(
            (base64) => resolve({ base64, mimeType: "image/jpeg" }),
            reject,
          );
        },
        "image/jpeg",
        CLIENT_JPEG_QUALITY,
      );
    };
    image.onerror = fail;
    image.src = url;
  });
}

/**
 * Turns the designer's source into the JSON body for `/api/analyze`.
 * A URL is forwarded as text. A screenshot is scaled on a canvas first; if the
 * browser cannot draw it, the original file is encoded instead.
 */
async function toAnalysisRequest(
  source: AnalysisSource,
  locale: Locale,
): Promise<AnalysisRequest | AnalysisErrorBody> {
  if (source.kind === "url") {
    return {
      kind: "url",
      label: source.label,
      url: source.url,
      locale,
    };
  }

  if (source.file.size > MAX_SCREENSHOT_BYTES) {
    return { code: "too_large", message: "" };
  }
  if (!isImageMimeType(source.file.type)) {
    return { code: "invalid_request", message: "" };
  }

  let imageBase64: string;
  let mimeType: ImageMimeType = source.file.type;
  try {
    const shrunk = await shrinkScreenshot(source.file);
    imageBase64 = shrunk.base64;
    mimeType = shrunk.mimeType;
  } catch {
    try {
      imageBase64 = await readFileAsBase64(source.file);
    } catch {
      return { code: "invalid_request", message: "" };
    }
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return { code: "too_large", message: "" };
  }
  return {
    kind: "screenshot",
    label: source.label,
    imageBase64,
    mimeType,
    locale,
  };
}

/** Parses the response when it is JSON. An empty or non-JSON body becomes null so the caller can show a generic error. */
async function readResponseBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** State for one in-flight review. `analyze` posts to `/api/analyze`; `reset` cancels it and clears the notes. */
export function useAIAnalysis(): UseAIAnalysisResult {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [stage, setStage] = useState<AnalysisStage>("preparing");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<AnalysisErrorBody | null>(null);

  // generation bumps on every new review and on unmount, so a late response
  // from an older request cannot overwrite the one the designer is looking at.
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setStage("preparing");
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  const analyze = useCallback(async (source: AnalysisSource, locale: Locale) => {
    const generation = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const isCurrent = () => generation === generationRef.current;

    setStatus("loading");
    setStage("preparing");
    setProgress(8);
    setResult(null);
    setError(null);

    let settled = false;
    let markIndex = 0;
    // The model returns one payload, so the bar is a timer, not upload progress.
    const timer = window.setInterval(() => {
      if (settled || !isCurrent()) return;
      markIndex = Math.min(markIndex + 1, STAGE_MARKS.length - 1);
      const mark = STAGE_MARKS[markIndex];
      if (!mark) return;
      setStage(mark.stage);
      setProgress((current) => Math.max(current, mark.progress));
    }, 700);

    try {
      const payload = await toAnalysisRequest(source, locale);
      if (!isCurrent()) return;
      if ("code" in payload) {
        setStatus("error");
        setError(payload);
        return;
      }

      setStage("sending");
      setProgress((current) => Math.max(current, 28));

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
        cache: "no-store",
      });

      if (!isCurrent()) return;

      // The body is the finished review, so the last phase is parsing it.
      setStage("writing");
      setProgress((current) => Math.max(current, 92));
      const body = await readResponseBody(response);
      if (!isCurrent()) return;

      if (!response.ok) {
        setStatus("error");
        setError(
          isAnalysisErrorBody(body)
            ? body
            : { code: "upstream", message: "" },
        );
        return;
      }

      if (!isAnalysisResult(body)) {
        setStatus("error");
        setError({ code: "parse", message: "" });
        return;
      }

      setResult(body);
      setProgress(100);
      setStatus("success");
    } catch (caught) {
      if (!isCurrent() || controller.signal.aborted) return;
      const timedOut =
        caught instanceof Error &&
        (caught.name === "TimeoutError" || caught.name === "AbortError" || /timeout/i.test(caught.message));
      setStatus("error");
      setError({ code: timedOut ? "timeout" : "network", message: "" });
    } finally {
      settled = true;
      window.clearInterval(timer);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  return { status, stage, progress, result, error, analyze, reset };
}

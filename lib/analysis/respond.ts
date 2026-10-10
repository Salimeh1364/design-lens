import type { AnalysisErrorBody, AnalysisErrorCode } from "@/types/analysis";

/**
 * Every failure the browser sees uses the same envelope. The UI translates
 * `code`. `message` is only a fallback for logs and non-UI callers.
 *
 * همهٔ خطاها با یک شکل به مرورگر می‌رسند. رابط `code` را ترجمه می‌کند
 * و `message` فقط پشتیبان لاگ و فراخوان‌های غیررابط است.
 */
export function analysisError(
  status: number,
  code: AnalysisErrorCode,
  message: string,
): Response {
  const body: AnalysisErrorBody = { code, message };
  return Response.json(body, { status });
}

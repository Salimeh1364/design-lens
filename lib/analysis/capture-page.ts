import sharp from "sharp";
import type { Browser, HTTPRequest } from "puppeteer";
import {
  assertPublicDestination,
  isObviouslyBlockedUrl,
  PageFetchError,
} from "@/lib/analysis/fetch-page";

/** The screenshot engine must return or fail inside this window. */
const CAPTURE_TIMEOUT_MS = 8_000;
const MAX_CAPTURE_WIDTH = 1280;
const JPEG_QUALITY = 55;
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 } as const;

function cancelled(): DOMException {
  return new DOMException("The review was cancelled.", "AbortError");
}

function withDeadline<T>(work: Promise<T>, parent: AbortSignal, onTimeout: () => void): Promise<T> {
  if (parent.aborted) return Promise.reject(cancelled());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new PageFetchError("timeout"));
    }, CAPTURE_TIMEOUT_MS);

    const onAbort = () => {
      clearTimeout(timer);
      onTimeout();
      reject(cancelled());
    };
    parent.addEventListener("abort", onAbort, { once: true });

    work.then(
      (value) => {
        clearTimeout(timer);
        parent.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        parent.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function allowRequest(request: HTTPRequest): Promise<boolean> {
  const target = request.url();
  if (target.startsWith("data:") || target.startsWith("blob:")) return true;

  try {
    const parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  } catch {
    return false;
  }

  if (isObviouslyBlockedUrl(target)) return false;
  if (!request.isNavigationRequest()) return true;

  try {
    await assertPublicDestination(target);
    return true;
  } catch {
    return false;
  }
}

async function compressScreenshot(raw: Uint8Array): Promise<string> {
  const compressed = await sharp(Buffer.from(raw))
    .resize({ width: MAX_CAPTURE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  if (compressed.byteLength === 0) throw new PageFetchError("unreachable");
  return compressed.toString("base64");
}

async function shoot(browser: Browser, pageUrl: string): Promise<string> {
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(CAPTURE_TIMEOUT_MS);
    page.setDefaultTimeout(CAPTURE_TIMEOUT_MS);
    await page.setViewport(VIEWPORT);
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void allowRequest(request).then(
        (allowed) => {
          if (allowed) void request.continue().catch(() => undefined);
          else void request.abort().catch(() => undefined);
        },
        () => {
          void request.abort().catch(() => undefined);
        },
      );
    });
    await page.goto(pageUrl, { waitUntil: "load", timeout: CAPTURE_TIMEOUT_MS });
    const raw = await page.screenshot({
      type: "jpeg",
      quality: 70,
      captureBeyondViewport: false,
    });
    return compressScreenshot(raw);
  } finally {
    void page.close().catch(() => undefined);
  }
}

function closeBrowser(browser: Browser | undefined) {
  if (!browser) return;
  const killTimer = setTimeout(() => {
    browser.process()?.kill();
  }, 1_000);
  void browser
    .close()
    .catch(() => {
      browser.process()?.kill();
    })
    .finally(() => clearTimeout(killTimer));
}

/**
 * Opens a public page in headless Chrome, then shrinks the first screen to a
 * JPEG no wider than 1280px before it is sent to the model.
 * Launch, navigation, and encoding all share one 8 second deadline.
 */
export async function capturePublicScreenshot(rawUrl: string, signal: AbortSignal): Promise<string> {
  const pageUrl = (await assertPublicDestination(rawUrl)).toString();
  if (signal.aborted) throw cancelled();

  const puppeteer = await import("puppeteer");
  let browser: Browser | undefined;
  const kill = () => {
    browser?.process()?.kill();
  };

  const launching = puppeteer.default.launch({
    headless: true,
    timeout: CAPTURE_TIMEOUT_MS,
    protocolTimeout: CAPTURE_TIMEOUT_MS,
    args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--disable-extensions"],
  });
  void launching.then((opened) => {
    browser = opened;
  });

  const work = launching.then((opened) => {
    browser = opened;
    if (signal.aborted) throw cancelled();
    return shoot(opened, pageUrl);
  });

  try {
    return await withDeadline(work, signal, kill);
  } catch (error) {
    kill();
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw cancelled();
    if (error instanceof PageFetchError) throw error;
    if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
      throw new PageFetchError("timeout");
    }
    throw new PageFetchError("unreachable");
  } finally {
    if (browser) closeBrowser(browser);
    else void launching.then((opened) => closeBrowser(opened)).catch(() => undefined);
  }
}

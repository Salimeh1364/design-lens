import sharp from "sharp";
import type { Browser, HTTPRequest } from "puppeteer";
import {
  assertPublicDestination,
  isObviouslyBlockedUrl,
  PageFetchError,
} from "@/lib/analysis/fetch-page";

/**
 * Hard stop for launch, navigation, and encoding.
 * Seven seconds leaves room under Vercel's 10 second function limit.
 */
const CAPTURE_TIMEOUT_MS = 7_000;
/** Longest edge of the JPEG sent to Gemini. Wider captures are scaled down; smaller ones are left alone. */
const MAX_CAPTURE_WIDTH = 1280;
/** JPEG quality for the image Gemini receives. High enough to read type, small enough to send quickly. */
const JPEG_QUALITY = 80;
/** One desktop screen. deviceScaleFactor 1 avoids a retina image that is twice as wide as the viewport. */
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 } as const;

/** AbortError so the route can tell a cancelled review from a capture timeout. */
function cancelled(): DOMException {
  return new DOMException("The review was cancelled.", "AbortError");
}

/**
 * Resolves with `work`, or rejects when seven seconds pass or the designer cancels.
 * `onTimeout` is expected to kill Chrome. The timer is cleared if `work` settles first,
 * so a finished screenshot is not thrown away.
 */
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

/**
 * Decides whether Chrome may load a URL while shooting the page.
 * Images and stylesheets are allowed when the host is not obviously private.
 * A navigation, including a redirect, is checked again with DNS so the browser
 * cannot be sent to a loopback or cloud-metadata address.
 */
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

/**
 * Shrinks the captured JPEG to at most 1280px wide and re-encodes it at 80% quality.
 * `withoutEnlargement` leaves an already-small screen at its real size.
 * The return value is raw base64, which is what Gemini's inline image part expects.
 */
async function compressScreenshot(raw: Uint8Array): Promise<string> {
  const compressed = await sharp(Buffer.from(raw))
    .resize({ width: MAX_CAPTURE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  if (compressed.byteLength === 0) throw new PageFetchError("unreachable");
  return compressed.toString("base64");
}

/**
 * Opens one tab, waits until the HTML is parsed, and photographs the viewport only.
 * `domcontentloaded` returns as soon as the document is ready, instead of waiting for every image and script.
 * Closing the tab is not awaited, because a stuck close must not hold the seven-second deadline.
 */
async function shoot(browser: Browser, pageUrl: string): Promise<string> {
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(CAPTURE_TIMEOUT_MS);
    page.setDefaultTimeout(CAPTURE_TIMEOUT_MS);
    await page.setViewport(VIEWPORT);
    // Every request has to continue or abort, or goto waits until the deadline.
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
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: CAPTURE_TIMEOUT_MS });
    // The shot itself is also capped, so a hung encoder cannot outlive the route deadline.
    const raw = await page.screenshot({
      type: "jpeg",
      quality: JPEG_QUALITY,
      captureBeyondViewport: false,
    });
    return compressScreenshot(raw);
  } finally {
    void page.close().catch(() => undefined);
  }
}

/**
 * Asks Chrome to exit, then kills the process if close is still running after one second.
 * Called without awaiting so the route can answer while the browser shuts down.
 */
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
 * JPEG no wider than 1280px, at 80% quality, before it is sent to the model.
 * Launch, navigation, and encoding all share one 7 second deadline.
 */
export async function capturePublicScreenshot(rawUrl: string, signal: AbortSignal): Promise<string> {
  const pageUrl = (await assertPublicDestination(rawUrl)).toString();
  if (signal.aborted) throw cancelled();

  let browser: Browser | undefined;
  let launching: Promise<Browser> | undefined;
  // Kill is separate from closeBrowser: the deadline must stop a hung launch immediately.
  const kill = () => {
    browser?.process()?.kill();
  };

  // Import, launch, and the shot share one clock so the route returns inside 7 seconds.
  const work = (async () => {
    const puppeteer = await import("puppeteer");
    launching = puppeteer.default.launch({
      headless: true,
      timeout: CAPTURE_TIMEOUT_MS,
      protocolTimeout: CAPTURE_TIMEOUT_MS,
      args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--disable-extensions"],
    });
    const opened = await launching;
    browser = opened;
    if (signal.aborted) throw cancelled();
    return shoot(opened, pageUrl);
  })();

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
    else if (launching) void launching.then((opened) => closeBrowser(opened)).catch(() => undefined);
  }
}

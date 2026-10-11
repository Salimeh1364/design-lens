import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { Browser, HTTPRequest, Page } from "puppeteer";
import {
  assertPublicDestination,
  isObviouslyBlockedUrl,
  PageFetchError,
} from "@/lib/analysis/fetch-page";

/**
 * Hard stop for navigation and encoding, after Chrome is already open.
 * Six seconds keeps a warm capture inside Vercel's 10 second function limit.
 */
const CAPTURE_TIMEOUT_MS = 6_000;
/** Longest edge of the JPEG sent to Gemini. Wider captures are scaled down; smaller ones are left alone. */
const MAX_CAPTURE_WIDTH = 1280;
/** JPEG quality for the image Gemini receives. High enough to read type, small enough to send quickly. */
const JPEG_QUALITY = 80;
/** One desktop screen. deviceScaleFactor 1 avoids a retina image that is twice as wide as the viewport. */
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 } as const;
/** A normal desktop Chrome identity. The default headless name makes some public sites stall or refuse the visit. */
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** One Chrome process for the life of the server. Launching it inside the page deadline left heavy public sites with no time to paint. */
let browserPromise: Promise<Browser> | null = null;
/**
 * Chromium build for Vercel's Linux. The Chrome that Puppeteer uses on a
 * laptop does not start there, so the capture used to hit the six-second
 * deadline before the page was open.
 * See https://github.com/Sparticuz/chromium/releases/tag/v153.0.0
 */
const REMOTE_CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

/** AbortError so the route can tell a cancelled review from a capture timeout. */
function cancelled(): DOMException {
  return new DOMException("The review was cancelled.", "AbortError");
}

/**
 * Resolves with `work`, or rejects when six seconds pass or the designer cancels.
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
 * Shrinks a captured or uploaded image to at most 1280px wide and re-encodes it
 * as an 80% JPEG. `withoutEnlargement` leaves an already-small screen at its real size.
 * The return value is raw base64, which is what Gemini's inline image part expects.
 */
async function compressToJpeg(raw: Uint8Array): Promise<string> {
  const compressed = await sharp(Buffer.from(raw))
    .rotate()
    .resize({ width: MAX_CAPTURE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  if (compressed.byteLength === 0) throw new Error("empty image");
  return compressed.toString("base64");
}

async function compressScreenshot(raw: Uint8Array): Promise<string> {
  return compressToJpeg(raw);
}

/** Same 1280px JPEG as a URL capture, for a screenshot the browser already posted. */
export async function compressImageBase64(data: string): Promise<string> {
  const normalized = data.replace(/\s/g, "");
  if (!normalized) throw new Error("empty image");
  return compressToJpeg(Buffer.from(normalized, "base64"));
}

/**
 * Opens one tab, waits until the HTML is parsed, and photographs the viewport only.
 * `domcontentloaded` returns as soon as the document is ready, instead of waiting for every image and script.
 * Closing the tab is not awaited, because a stuck close must not hold the six-second deadline.
 */
async function shoot(
  browser: Browser,
  pageUrl: string,
  handle: { page?: Page },
): Promise<string> {
  const page = await browser.newPage();
  handle.page = page;
  try {
    page.setDefaultNavigationTimeout(CAPTURE_TIMEOUT_MS);
    page.setDefaultTimeout(CAPTURE_TIMEOUT_MS);
    await page.setUserAgent({ userAgent: DESKTOP_CHROME });
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

/** Desktop Chrome for local reviews. Vercel does not have this binary. */
async function launchLocalBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer");
  return puppeteer.default.launch({
    headless: true,
    timeout: 8_000,
    protocolTimeout: 20_000,
    args: ["--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--disable-extensions"],
  });
}

/**
 * Opens the Linux Chromium build on Vercel.
 * A pack prepared at deploy time is used when it is present. Otherwise the
 * same pack is downloaded into the function's temp folder.
 */
async function launchServerlessBrowser(): Promise<Browser> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const localPack = join(process.cwd(), "vendor", "chromium");
  const pack = existsSync(join(localPack, "chromium.br")) ? localPack : REMOTE_CHROMIUM_PACK;
  const executablePath = await chromium.executablePath(pack);
  const browser = await puppeteer.default.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    defaultViewport: {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: VIEWPORT.deviceScaleFactor,
    },
    timeout: 45_000,
    protocolTimeout: 45_000,
  });
  return browser as unknown as Browser;
}

/**
 * Starts Chrome once and reuses it. A later review only pays for the page,
 * so the six-second deadline is not spent launching the browser.
 * A disconnected process is dropped so the next review starts a fresh one.
 */
function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    return browserPromise.then((browser) => {
      if (browser.connected) return browser;
      browserPromise = null;
      return getBrowser();
    });
  }

  browserPromise = (async () => {
    const browser = process.env.VERCEL === "1" ? await launchServerlessBrowser() : await launchLocalBrowser();
    const launched = browserPromise;
    browser.once("disconnected", () => {
      if (browserPromise === launched) browserPromise = null;
    });
    return browser;
  })().catch((error: unknown) => {
    browserPromise = null;
    throw error;
  });

  return browserPromise;
}

/**
 * Opens a public page in headless Chrome, then shrinks the first screen to a
 * JPEG no wider than 1280px, at 80% quality, before it is sent to the model.
 * Navigation and encoding share one 6 second deadline. Chrome itself stays open.
 */
export async function capturePublicScreenshot(rawUrl: string, signal: AbortSignal): Promise<string> {
  const pageUrl = (await assertPublicDestination(rawUrl)).toString();
  if (signal.aborted) throw cancelled();

  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 180) : "unknown";
    console.error("capture_browser_failed", detail);
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw cancelled();
    if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
      throw new PageFetchError("timeout");
    }
    throw new PageFetchError("unreachable");
  }
  if (signal.aborted) throw cancelled();

  const handle: { page?: Page } = {};
  const stopPage = () => {
    void handle.page?.close().catch(() => undefined);
  };

  try {
    return await withDeadline(shoot(browser, pageUrl, handle), signal, stopPage);
  } catch (error) {
    stopPage();
    if (!browser.connected) browserPromise = null;
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw cancelled();
    if (error instanceof PageFetchError) throw error;
    if (error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)) {
      throw new PageFetchError("timeout");
    }
    throw new PageFetchError("unreachable");
  }
}

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Turns a public page into a short outline the model can critique.
 *
 * Redirects are followed by hand. A normal redirect could otherwise leave
 * the public site and land on a loopback, link-local, or cloud-metadata
 * address. Each hop is checked again before it is fetched.
 *
 * Limitation: DNS is checked, then the request is sent. A rebinding DNS
 * record could change in that gap. The hostname block list and the private
 * IP check still close the common cases.
 */

/** Limits for the text outline. The live URL review captures a screenshot and does not use these. */
const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8_000;
const OUTLINE_CHARS = 12_000;

/** Why a page could not be read or captured. The route maps `reason` onto an API error code. */
export class PageFetchError extends Error {
  readonly reason: "blocked" | "unreachable" | "not_html" | "too_large" | "timeout";

  constructor(reason: PageFetchError["reason"]) {
    super(reason);
    this.name = "PageFetchError";
    this.reason = reason;
  }
}

/**
 * True for loopback, private, link-local, CGNAT, and multicast addresses, in IPv4 and IPv6.
 * IPv4-mapped IPv6 addresses are unwrapped and checked as IPv4.
 * An address we cannot classify is treated as non-public.
 */
function isNonPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 0) return true;

  if (version === 4) {
    const parts = address.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
    const [first, second] = parts;
    if (first === 0 || first === 10 || first === 127) return true;
    // Link-local, including the cloud metadata address 169.254.169.254.
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
    // 192.0.0.0/24 and 192.0.2.0/24 are reserved. The rest of 192.0.0.0/16, such as 192.0.66.18, is public.
    if (first === 192 && second === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
    if (first === 198 && (second === 18 || second === 19)) return true;
    if (first >= 224) return true;
    return false;
  }

  const ip = address.toLowerCase().split("%")[0] ?? "";
  if (ip === "::" || ip === "::1") return true;

  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (dotted?.[1]) return isNonPublicIp(dotted[1]);

  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hexMapped?.[1] && hexMapped[2]) {
    const high = Number.parseInt(hexMapped[1], 16);
    const low = Number.parseInt(hexMapped[2], 16);
    const mapped = `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
    return isNonPublicIp(mapped);
  }

  // Compressed addresses that start with ":" (other than the cases above)
  // are not a public host we can safely classify.
  if (ip.startsWith(":")) return true;

  const firstHextet = ip.split(":")[0] ?? "";
  const first = Number.parseInt(firstHextet, 16);
  if (!Number.isInteger(first)) return true;
  if (first === 0) return true;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  return false;
}

/** Rejects non-http URLs, credentials, localhost, and IP literals that are not public. DNS is separate. */
function assertPublicUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PageFetchError("blocked");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PageFetchError("blocked");
  }
  if (url.username || url.password) throw new PageFetchError("blocked");

  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new PageFetchError("blocked");
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new PageFetchError("blocked");
  }
  if (hostname === "metadata.google.internal" || /^\d+$/.test(hostname)) {
    throw new PageFetchError("blocked");
  }
  if (isIP(hostname) && isNonPublicIp(hostname)) throw new PageFetchError("blocked");

  return url;
}

/** Resolves the hostname and rejects the request if any answer is a non-public address. */
async function assertPublicDns(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isNonPublicIp(hostname)) throw new PageFetchError("blocked");
    return;
  }

  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new PageFetchError("unreachable");
  }

  if (records.length === 0 || records.some((record) => isNonPublicIp(record.address))) {
    throw new PageFetchError("blocked");
  }
}

/** Reads the body up to `maxBytes`, then stops. A longer page is `too_large` rather than buffered whole. */
async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new PageFetchError("unreachable");

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PageFetchError("too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof PageFetchError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new PageFetchError("unreachable");
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

/** Turns the handful of entities that show up in titles and headings back into characters. */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const point = Number(code);
      if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff) return "";
      return String.fromCodePoint(point);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      const point = Number.parseInt(code, 16);
      if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff) return "";
      return String.fromCodePoint(point);
    });
}

/** Drops tags and collapses whitespace so a heading or button label is one line of text. */
function visibleText(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Collects up to `limit` short text matches. Empty matches are skipped. */
function collect(html: string, pattern: RegExp, limit: number): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const text = visibleText(match[1] ?? "");
    if (!text) continue;
    found.push(text.slice(0, 180));
    if (found.length >= limit) break;
  }
  return found;
}

/**
 * A structural reading, not a render. Scripts and styles are dropped so the
 * model reviews the content a person came for.
 */
function outlinePage(pageUrl: string, html: string): string {
  const withoutCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const title = visibleText(withoutCode.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = visibleText(
    withoutCode.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i,
    )?.[1] ??
      withoutCode.match(
        /<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i,
      )?.[1] ??
      "",
  );
  const headings = collect(withoutCode, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 40);
  const controls = collect(withoutCode, /<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/gi, 40);
  const text = visibleText(withoutCode).slice(0, 6000);

  const outline = [
    `URL: ${pageUrl}`,
    `Title: ${title || "(none)"}`,
    `Description: ${description || "(none)"}`,
    "Headings:",
    headings.length > 0 ? headings.map((heading) => `- ${heading}`).join("\n") : "- (none)",
    "Links and buttons:",
    controls.length > 0 ? controls.map((control) => `- ${control}`).join("\n") : "- (none)",
    "Visible text:",
    text || "(none)",
  ].join("\n");

  return outline.slice(0, OUTLINE_CHARS);
}

/** Accepts an HTML content type, or a body that starts like an HTML document. */
function looksLikeHtml(html: string, contentType: string): boolean {
  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    return true;
  }
  return /^\s*(?:<!doctype html|<html\b)/i.test(html.slice(0, 300));
}

/** Confirms the address is public, including a DNS lookup, before any browser navigation. */
export async function assertPublicDestination(rawUrl: string): Promise<URL> {
  const url = assertPublicUrl(rawUrl);
  await assertPublicDns(url.hostname);
  return url;
}

/** Synchronous reject for loopback, credentials, and non-http URLs. DNS waits until fetch. */
export function isObviouslyBlockedUrl(rawUrl: string): boolean {
  try {
    assertPublicUrl(rawUrl);
    return false;
  } catch {
    return true;
  }
}

/**
 * Fetches a public HTML page and returns a short outline of its title, headings, and text.
 * Redirects are followed manually so each hop is checked before it is requested.
 * Available when a caller needs a text reading of a public page.
 * The live URL review captures a screenshot instead of calling this.
 */
export async function readPublicPage(rawUrl: string, signal: AbortSignal): Promise<string> {
  let current = assertPublicUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicDns(current.hostname);

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "DesignLens/0.1",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new PageFetchError("unreachable");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      // A missing Location, or more hops than MAX_REDIRECTS, is treated as unreachable.
      if (!location || hop === MAX_REDIRECTS) throw new PageFetchError("unreachable");
      current = assertPublicUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new PageFetchError("unreachable");

    const html = await readLimitedText(response, MAX_HTML_BYTES);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!looksLikeHtml(html, contentType)) throw new PageFetchError("not_html");
    return outlinePage(current.toString(), html);
  }

  throw new PageFetchError("unreachable");
}

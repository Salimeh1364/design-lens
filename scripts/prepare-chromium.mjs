import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

/**
 * Vercel cannot run the Chrome build that Puppeteer downloads for a laptop.
 * During a Vercel install, this fetches the serverless Chromium pack and
 * leaves the compressed files where the analyze route can open them.
 * A local install skips the download.
 */
const PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dest = join(root, "vendor", "chromium");

if (process.env.VERCEL !== "1") {
  console.log("Skipping the serverless Chromium pack outside Vercel.");
  process.exit(0);
}

if (existsSync(join(dest, "chromium.br"))) {
  console.log("Serverless Chromium pack is already prepared.");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
const tarPath = join(dest, "pack.tar");

const response = await fetch(PACK_URL, { redirect: "follow" });
if (!response.ok || !response.body) {
  throw new Error(`Chromium pack download failed (${response.status}).`);
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(tarPath));
execFileSync("tar", ["-xf", tarPath, "-C", dest], { stdio: "inherit" });
rmSync(tarPath, { force: true });

const nested = readdirSync(dest, { withFileTypes: true }).filter((entry) => entry.isDirectory());
if (!existsSync(join(dest, "chromium.br")) && nested.length === 1) {
  const inner = join(dest, nested[0].name);
  for (const name of readdirSync(inner)) {
    execFileSync("mv", [join(inner, name), join(dest, name)]);
  }
  rmSync(inner, { recursive: true, force: true });
}

if (!existsSync(join(dest, "chromium.br"))) {
  throw new Error("The Chromium pack did not contain chromium.br.");
}

console.log("Prepared the serverless Chromium pack.");

import type { NextConfig } from "next";

/**
 * Puppeteer and sharp ship native binaries, so Next must not bundle them.
 * The body limit matches the screenshot cap: a 10 MB image is larger once it is base64 JSON.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer", "sharp"],
  experimental: {
    // A 10 MB screenshot becomes about 14 MB of base64 JSON. The default
    // proxy buffer is 10 MB, which would clip the body before the route
    // can read it.
    proxyClientMaxBodySize: "16mb",
  },
};

export default nextConfig;

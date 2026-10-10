import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A 10 MB screenshot becomes about 14 MB of base64 JSON. The default
    // proxy buffer is 10 MB, which would clip the body before the route
    // can read it.
    proxyClientMaxBodySize: "16mb",
  },
};

export default nextConfig;

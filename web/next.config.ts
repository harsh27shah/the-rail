import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, which a real phone photo blows past immediately. This is now a
      // genuinely per-photo limit — the Add flow uploads a multi-photo selection one photo
      // per request (see src/app/add/actions.ts) — so it only needs to fit the single
      // largest phone photo, with headroom for high-megapixel output.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, which a real phone photo blows past immediately. Garment photos
      // don't need to be huge, but leave real headroom for typical phone camera output.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;

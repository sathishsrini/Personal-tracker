import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Google client libraries are Node-only; keep them out of the bundler.
  serverExternalPackages: ["@googleapis/sheets", "google-auth-library"],
};

export default nextConfig;

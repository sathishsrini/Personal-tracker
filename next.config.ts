import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Google client libraries are Node-only; keep them out of the bundler.
  serverExternalPackages: ["@googleapis/sheets", "google-auth-library"],
  // Pin the workspace root: a lockfile elsewhere under the user's home directory
  // would otherwise make Turbopack guess the wrong project root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;

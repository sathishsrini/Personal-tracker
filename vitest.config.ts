import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The repo/local-driver tests hit the filesystem; 5s is too tight on
    // Windows and made `npm test` fail intermittently on a healthy tree.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/client/**", "src/lib/types.ts"],
      reporter: ["text-summary", "lcov"],
    },
  },
});

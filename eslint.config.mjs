import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "data/**", "credentials/**"]),
  {
    // Tracked debt, deliberately narrowed to the two files that already have it.
    // Both planners mirror the fetched plan into editable local state with a
    // `setItems` inside an effect. Fixing it properly means reworking how an
    // in-progress edit reconciles with a refetch, which is a behavior change,
    // not a lint fix. Scoping the exception to these files means any NEW
    // occurrence anywhere else still fails the build.
    files: ["src/app/planner/daily/page.tsx", "src/app/planner/weekly/page.tsx"],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
]);

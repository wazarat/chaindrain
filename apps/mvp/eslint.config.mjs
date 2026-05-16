import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Drizzle introspect output is regenerated; not hand-edited.
    "src/lib/db/schema.ts",
    "src/lib/db/relations.ts",
    "src/lib/db/meta/**",
    "src/lib/db/0000_*.sql",
  ]),
]);

export default eslintConfig;

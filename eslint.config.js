import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts"]),
  {
    files: ["app/pool/page.tsx"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

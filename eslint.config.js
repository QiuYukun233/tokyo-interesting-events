import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// NOTE: this is the only ESLint config. There used to be an `eslint.config.mjs`
// as well — a leftover from the first commit that ESLint silently ignored,
// because `eslint.config.js` wins. Editing the dead one and watching a new rule
// have no effect is the same failure 决策记录/0001 is about: two files, one of
// them live, no signal telling you which. Deleted 2026-08-28.
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
  {
    // 决策记录/0004: a collector's only write entry point is upsertCandidate().
    // `data/events.json` and `data/review-events.json` are export products.
    // Writing them from a collector both bypasses the candidate pool and gets
    // silently erased by the next `npm run export-site` — which is exactly how
    // the shop-lifecycle chain ran dead without failing anything.
    //
    // Only string literals are matched, so the historical explanation in a
    // comment stays legal; a path does not.
    files: ["scripts/collect-*.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/events\.json/]",
          message:
            "采集脚本不能写 data/events.json 或 data/review-events.json；唯一写入口是 upsertCandidate()。见 docs/决策记录/0004-采集脚本一律写池子.md",
        },
        {
          selector: "TemplateElement[value.raw=/events\.json/]",
          message:
            "采集脚本不能写 data/events.json 或 data/review-events.json；唯一写入口是 upsertCandidate()。见 docs/决策记录/0004-采集脚本一律写池子.md",
        },
      ],
    },
  },
]);

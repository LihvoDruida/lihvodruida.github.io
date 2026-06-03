import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  ...nextVitals,
  ...nextTs,
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // The dashboard consumes several external payloads (Discord, Battle.net,
      // Firebase, Cloudflare Worker snapshots). Those responses are normalized
      // at runtime, so forcing explicit deep TypeScript models for every raw
      // payload creates noisy warnings without improving production safety.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",

      // The UI uses external CDN/Discord/Battle.net images and WoW media where
      // Next/Image is not always safer or cheaper. Keep the markup predictable.
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",

      // React 19 compiler-era hook lint rules are too strict for several
      // controlled form synchronizers in this dashboard. Typecheck remains the
      // source of truth for correctness; targeted refactors can be done later.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "tsconfig.tsbuildinfo",
  ]),
]);

export default eslintConfig;

// Flat ESLint config (ESLint 9) for the npm-workspaces monorepo.
// - web/  : browser + React (hooks + fast-refresh) TypeScript
// - edge/ : Node Lambda@Edge TypeScript
// - infra/: Node AWS CDK TypeScript
// Non-type-checked rules only (fast, no tsconfig project wiring needed).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  // Build output / generated files — never linted.
  {
    ignores: [
      "**/dist/**",
      "**/cdk.out/**",
      "**/coverage/**",
      "**/*.d.ts",
    ],
  },

  // Base JS + TypeScript recommended rules (applied to all source).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Allow intentionally-unused identifiers prefixed with "_" (e.g. mock params).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Web app: browser globals + the essential React hooks / fast-refresh rules.
  {
    files: ["web/src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // Node contexts: edge Lambda, CDK infra, the Vite dev plugin, config files.
  {
    files: [
      "edge/**/*.ts",
      "infra/**/*.ts",
      "web/dev/**/*.ts",
      "**/*.config.{js,ts,mjs,cjs}",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
);

import js from "@eslint/js";
import promise from "eslint-plugin-promise";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import regexp from "eslint-plugin-regexp";
import security from "eslint-plugin-security";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarjs from "eslint-plugin-sonarjs";
import tailwind from "eslint-plugin-tailwindcss";
import unicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
// The following import lacks types on npm; runtime shape matches ESLint plugin.
// eslint-disable-next-line import/no-unresolved -- resolved by node at runtime
import betterMaxParams from "eslint-plugin-better-max-params";

// Type-checked TS rules (recommendedTypeChecked) run on ts/tsx only.
export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/components/ui/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  security.configs.recommended,
  regexp.configs["flat/recommended"],
  promise.configs["flat/recommended"],
  ...tailwind.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      unicorn,
      "simple-import-sort": simpleImportSort,
      "better-max-params": betterMaxParams,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // AI guardrails — keep functions small and readable.
      "better-max-params/better-max-params": ["warn", { func: 5, constructor: 10 }],
      "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],
      // no-magic-numbers is noisy in audio code (envelopes, harmonic multipliers, gain
      // values) where the numbers ARE the domain. Kept off; use named consts where meaningful.
      "no-magic-numbers": "off",
      "sonarjs/cognitive-complexity": ["error", 20],
      "max-depth": ["error", 4],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-param-reassign": "error",
      "id-length": [
        "warn",
        { min: 2, exceptions: ["S", "m", "i", "j", "x", "y", "g", "o", "b", "h", "w", "e", "p", "r", "d", "n", "t", "s", "a", "v", "l"] },
      ],

      // TS quality
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      // unbound-method flags every action-callback we pass through props; hooks
      // return stable callback refs so this is a false positive here.
      "@typescript-eslint/unbound-method": "off",
      // sonarjs prefers readonly props everywhere; React reassigns props internally,
      // and readonly on Props types is noise for how we write components.
      "sonarjs/prefer-read-only-props": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",

      // Unicorn — sane defaults, disable noisy ones
      "unicorn/prefer-at": "warn",
      "unicorn/prefer-string-replace-all": "warn",
      "unicorn/prefer-number-properties": "warn",
      "unicorn/no-lonely-if": "warn",
      "unicorn/no-abusive-eslint-disable": "error",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "unicorn/filename-case": "off",
      "unicorn/prefer-query-selector": "off",
      "unicorn/prefer-add-event-listener": "off",
      "unicorn/prefer-spread": "off",
      "unicorn/no-array-for-each": "off",
      "unicorn/no-array-reduce": "off",
      "unicorn/prefer-module": "off",

      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",

      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message: "Named exports only — export const/function foo, not default.",
        },
        {
          selector: "CallExpression[callee.property.name='sort']",
          message: "Use .toSorted() — .sort() mutates in place.",
        },
        {
          selector: "CallExpression[callee.property.name='reverse']",
          message: "Use .toReversed() — .reverse() mutates in place.",
        },
      ],

      // Tailwind plugin — a few noisy ones off
      "tailwindcss/no-custom-classname": "off",

      // sonarjs — a few overly strict ones off
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/no-nested-template-literals": "off",
      "sonarjs/todo-tag": "off",
      // Nullish check with !== null is safer than != null (skips undefined). Keep our style.
      "sonarjs/different-types-comparison": "off",
      // Math.random is fine for exercise variety in a music trainer.
      "sonarjs/pseudo-random": "off",
      // Some computed keys look like injection to sonar; we already control the keys.
      "sonarjs/no-nested-functions": "off",

      // security plugin false-positive-prone
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  // Relax rules for .tsx (JSX often crosses line/function thresholds).
  {
    files: ["**/*.tsx"],
    rules: {
      "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  // Tests
  {
    files: ["src/test/**/*.{ts,tsx}"],
    rules: {
      "no-magic-numbers": "off",
      "max-lines-per-function": "off",
      "sonarjs/no-duplicate-string": "off",
    },
  },
  // Config files — allow default exports and looser rules
  {
    files: ["*.config.{ts,js,mjs,cjs}", "vite.config.ts", "vitest.config.ts", "tailwind.config.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "no-magic-numbers": "off",
    },
  },
  prettierConfig,
);

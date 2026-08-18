// @ts-check
/**
 * ESLint 9 flat config for YARK (Electron main/preload + React renderer + Vitest).
 *
 * Complements `scripts/lint.cjs` (feature file size + Actions pins). Does not
 * replace `tsc --noEmit`. React Compiler / `eslint-plugin-react-hooks`
 * "recommended" extras stay off until the compiler is adopted.
 */
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "node_modules/**",
    "out/**",
    "dist/**",
    "website/**",
    "coverage/**",
    "build/**",
    ".cursor/**",
    ".kilo/**",
    ".magicpath-*/**",
    ".tmp-magicpath-*/**",
  ]),

  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          // Preload/App use inline `import("…").T` in callback signatures.
          disallowTypeAnnotations: false,
        },
      ],
      "no-console": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      // INI parsers and log scanners use escaped regex that looks redundant.
      "no-useless-escape": "off",
      // Control-character scans in logs/INI are intentional.
      "no-control-regex": "off",
    },
  },

  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  {
    files: [
      "src/main/**/*.ts",
      "src/backend/**/*.ts",
      "src/preload/**/*.ts",
      "src/shared/**/*.ts",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },

  {
    files: ["scripts/**/*.{js,cjs,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "no-console": "off",
      "no-useless-escape": "off",
      "no-control-regex": "off",
    },
  },
  {
    files: ["eslint.config.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "module",
      globals: globals.node,
    },
  },
);

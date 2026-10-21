// ESLint flat config for the whole repo: Hardhat (CommonJS), the TypeScript
// functions, and the React UI. Formatting is Prettier's job; the one style
// rule enforced here is double quotes, which eslint-config-prettier would
// otherwise switch off, so it comes last.
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import prettier from "eslint-config-prettier";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "artifacts/**",
      "cache/**",
      "coverage/**",
      "typechain-types/**",
      "ignition/deployments/**",
      "src/functions/packages/**",
      // Vendored verbatim from the LBC wallet.
      "src/functions/src/lib/lbc/**",
    ],
  },

  js.configs.recommended,

  // Hardhat config, Ignition modules, tests and scripts: Node, CommonJS.
  {
    files: ["*.js", "ignition/**/*.js", "test/**/*.js", "scripts/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node, ...globals.mocha } },
  },
  // ESM scripts and this config.
  {
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },

  // Functions: TypeScript on Node.
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ["src/functions/**/*.ts"] })),
  {
    files: ["src/functions/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // UI: React with the automatic JSX runtime, in the browser.
  {
    files: ["src/ui/**/*.{js,jsx}"],
    ...react.configs.flat.recommended,
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      sourceType: "module",
      globals: globals.browser,
    },
    settings: { react: { version: "detect" } },
  },
  {
    files: ["src/ui/**/*.{js,jsx}"],
    ...react.configs.flat["jsx-runtime"],
  },
  {
    files: ["src/ui/**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/prop-types": "off",
    },
  },
  {
    files: ["src/ui/vite.config.js"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },

  // Let Prettier own formatting, then put back the one style rule we do want.
  prettier,
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/quotes": ["error", "double", { avoidEscape: true, allowTemplateLiterals: "always" }],
    },
  },
);

import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `dist` on its own is rooted, so it never matched backend/dist and `npm run lint` was reading
  // compiled .d.ts files as if a person had written them.
  { ignores: ["dist", "backend/dist", ".output", ".vinxi"] },

  // Everything TypeScript, both halves of the repository.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // The frontend. React and a browser, and until 2026-08-07 this block was the whole config, so
  // its rules and its browser globals applied to the Nest backend as well. Harmless only because
  // nothing ever ran eslint over the backend; see the block below and the `lint` job in CI.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
    },
  },

  // The backend. Nest on Node, no DOM and no React.
  {
    files: ["backend/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // The Nest application specifically, which is narrower than the block above: backend/prisma and
  // backend/scripts are command-line tools whose output is the point.
  {
    files: ["backend/src/**/*.ts"],
    rules: {
      // The application logs through StructuredLoggerService, which tags, redacts and correlates.
      // Two boot-time refusals are exempt and say so with a directive on the line: they run during
      // module evaluation, before there is an application context to log through, and both exit
      // the process immediately afterwards.
      "no-console": "error",
    },
  },

  eslintPluginPrettier,
);

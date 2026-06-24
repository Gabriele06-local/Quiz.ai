import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.es2025,
        renderMathInElement: "readonly",
        Chart: "readonly",
      },
    },
    rules: {
      "no-var": "off",
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-console": "off",
      "no-undef": "error",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "prefer-const": "warn",
      "no-useless-escape": "warn",
    },
  },
  {
    files: ["**/*.mjs", "scripts/**"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["tests/**"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: [
      "public/supabase-config.js",
      "coverage/",
      "node_modules/",
    ],
  },
];

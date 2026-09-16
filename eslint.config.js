import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@stylistic": stylistic,
    },
    rules: {
      "@stylistic/indent": ["warn", 2, { SwitchCase: 1 }],
      "@stylistic/brace-style": ["warn", "1tbs", { allowSingleLine: true }],
      "@stylistic/comma-dangle": ["warn", "always-multiline"],
      "@stylistic/keyword-spacing": "warn",
      "@stylistic/quotes": [
        "warn",
        "double",
        { avoidEscape: true, allowTemplateLiterals: "always" },
      ],
      "@stylistic/semi": ["warn", "always"],
      "@stylistic/space-before-function-paren": [
        "warn",
        { anonymous: "always", named: "never", asyncArrow: "always" },
      ],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);

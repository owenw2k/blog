import tsPlugin from "@typescript-eslint/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**"]),
  {
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-empty-object-type": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "TSEnumDeclaration", message: "Use union types or `as const` instead of enums." },
      ],
      "object-shorthand": ["error", "always"],
      curly: ["error", "all"],
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
  },
]);

export default eslintConfig;

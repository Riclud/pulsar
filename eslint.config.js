import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "site/dist/**", "cli/templates/**", "edge/**", "**/*.qml"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
        { blankLine: "any", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
        { blankLine: "always", prev: "*", next: "return" },
      ],
      "no-else-return": ["error", { allowElseIf: true }],
      "max-depth": ["error", 2],
      "func-style": ["error", "expression"],
      "prefer-arrow-callback": "error",
      "no-empty": "error",
      "no-restricted-imports": ["error", { patterns: [{ group: ["node:*"], message: "Import without the node: prefix." }] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
)

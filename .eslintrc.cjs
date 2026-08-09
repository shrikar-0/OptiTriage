// @ts-check
/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    // Allow explicit `any` during early scaffolding — tighten later
    '@typescript-eslint/no-explicit-any': 'warn',
    // Enforce React Fast Refresh compatibility
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Consistent import ordering (no plugin needed — just flag unused imports)
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Node / CJS config files
      files: ['*.cjs'],
      env: { node: true, browser: false },
      rules: { '@typescript-eslint/no-var-requires': 'off' },
    },
  ],
};

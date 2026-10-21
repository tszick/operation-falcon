import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'assets/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-proto': 'error',
      'no-extend-native': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  {
    files: ['server/**/*.mjs', 'server.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];

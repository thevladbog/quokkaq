import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // New in eslint-plugin-react-hooks 7.1+; codebase uses common patterns (e.g. isClient, media queries).
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'testplane-report/**',
    'coverage/**',
    'test-results/**',
    'lib/api/generated/**'
  ])
]);

export default eslintConfig;

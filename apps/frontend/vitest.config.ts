import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const isCi = Boolean(process.env.CI);
const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': appRoot
    }
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    reporters: isCi
      ? [
          'default',
          [
            'junit',
            {
              outputFile: 'test-results/vitest-junit.xml',
              suiteName: 'frontend'
            }
          ]
        ]
      : ['default'],
    coverage: isCi
      ? {
          enabled: true,
          provider: 'v8',
          reporter: ['text', 'json-summary', 'lcov'],
          reportsDirectory: './coverage'
        }
      : { enabled: false },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit-node',
          environment: 'node',
          include: ['lib/**/*.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'component-jsdom',
          environment: 'jsdom',
          include: ['**/*.test.tsx']
        }
      }
    ]
  }
});

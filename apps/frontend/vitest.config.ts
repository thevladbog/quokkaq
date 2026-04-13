import { defineConfig } from 'vitest/config';

const isCi = Boolean(process.env.CI);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
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
      : { enabled: false }
  }
});

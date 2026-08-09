import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run in Node environment (no browser APIs needed for pure function tests)
    environment: 'node',
    // Glob for test files
    include: ['src/**/*.test.ts'],
    // Coverage via V8 (fast, no instrumentation transform needed)
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});

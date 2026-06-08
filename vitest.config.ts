import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
    testTimeout: 15000,
    benchmark: {
      // Scope bench discovery to the real suite. Vitest's default `**` bench glob
      // otherwise walks stray .worktrees/.claude repo copies and runs duplicates.
      include: ['tests/benchmarks/**/*.bench.ts'],
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/index.ts'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});

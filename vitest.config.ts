import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Many tests build a whole TypeScript program; run together they can take several seconds each.
    testTimeout: 30_000,
  },
});

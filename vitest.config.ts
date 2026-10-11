import { defineConfig } from 'vitest/config';

// `pnpm probe` runs the same tests on instrumented code: probes injected at compile time record what throws, what
// leaves an unsafe directory and which casts are not true. The packages must be built first.
const probes = async () => {
  if (process.env['STRICT_TS_PROBE'] === undefined) return [];
  const { strictTsProbe } = await import('./packages/probe/dist/unsafe/vite.js');
  // Left alone: the tests themselves; the probes' own runtime, whose text is what instrumented modules carry; and the
  // classic invoice, which is the « before » and whose cast is known not to be true.
  const plugin = strictTsProbe({ exclude: ['/test/', '/packages/probe/src/runtime.ts', '/examples/invoice/classic/'] });
  return plugin.ok ? [plugin.value] : [];
};

export default defineConfig(async () => ({
  plugins: await probes(),
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Many tests build a whole TypeScript program; run together they can take several seconds each.
    testTimeout: process.env['STRICT_TS_PROBE'] === undefined ? 30_000 : 120_000,
  },
}));

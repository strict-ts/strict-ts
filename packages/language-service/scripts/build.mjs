// Bundles the plugin into one CommonJS file: tsserver loads plugins with require(), and expects the module itself to
// be the factory. core, std and the CLI's settings are bundled in; the compiler is the editor's own, passed at init.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  entryPoints: [`${root}src/index.ts`],
  outfile: `${root}dist/index.cjs`,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  logLevel: 'warning',
  footer: { js: 'module.exports = module.exports.default;' },
});
console.log('language-service: dist/index.cjs');

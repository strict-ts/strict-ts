import type { Config } from '../config.js';
import type { Report, Rule } from '../rule.js';
import type { Node } from '../syntax.js';

const isAllowed = (specifier: string, config: Config): boolean =>
  specifier.startsWith('.') ||
  config.allowedImports.some((allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`));

function checkSpecifier(specifier: Node | undefined, config: Config, isOwnModule: (specifier: Node) => boolean, report: Report): void {
  if (specifier?.kind !== 'string-literal' || isAllowed(specifier.text, config)) return;
  // A path alias (`@/lib/types`) names a file of the project, as a relative path does.
  if (isOwnModule(specifier)) return;
  report(
    specifier,
    `External import "${specifier.text}" forbidden outside unsafe/.`,
    'Wrap this dependency in unsafe/ and expose functions that return Result/Option.',
  );
}

export const noExternalImport: Rule = {
  name: 'no-external-import',
  guarantee: 'typing',
  description: 'Dependencies (npm, node:*) are imported from unsafe/ only: the equivalent of an FFI boundary.',
  scope: 'safe',
  inTests: false,
  visit(node, { config, isOwnModule, report }) {
    if (node.kind === 'module-reference') {
      checkSpecifier(node.specifier, config, isOwnModule, report);
    } else if (node.kind === 'call') {
      const dynamicImport = node.callee.kind === 'import-keyword';
      const require = node.callee.kind === 'identifier' && node.callee.text === 'require';
      if (dynamicImport || require) checkSpecifier(node.arguments[0], config, isOwnModule, report);
    }
  },
};

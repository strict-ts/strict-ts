import { type Config, defaultConfig, isUnsafe } from './config.js';
import { compareDiagnostics, type Diagnostic, diagnosticAt, locator } from './diagnostic.js';
import type { TypeProvider } from './provider.js';
import type { FileContext, Rule } from './rule.js';
import { rules as allRules } from './rules/index.js';
import type { Node } from './syntax.js';

/** Where a diagnostic about the project as a whole is shown. */
const PROJECT_FILE = 'tsconfig.json';

/** Runs the rules on the provider's program. Returns what is refused, the compiler's own errors included. */
export function check(
  provider: TypeProvider,
  config: Config = defaultConfig,
  rules: readonly Rule[] = allRules,
): readonly Diagnostic[] {
  const enabled = rules.filter((rule) => config.rules === undefined || config.rules.includes(rule.name));
  const found: Diagnostic[] = [...provider.compilerDiagnostics];

  for (const rule of enabled) {
    if (rule.scope !== 'project') continue;
    rule.project?.({
      compilerOptions: provider.compilerOptions,
      report: (message, help) =>
        found.push({ rule: rule.name, file: PROJECT_FILE, start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, message, help }),
    });
  }

  for (const file of provider.files) {
    const unsafe = isUnsafe(file.name, config);
    const locate = locator(file.text);
    const active = enabled
      .filter((rule) => rule.scope === 'all' || rule.scope === (unsafe ? 'unsafe' : 'safe'))
      .map((rule) => {
        const context: FileContext = {
          file,
          config,
          typeOf: provider.typeOf,
          exports: () => provider.exportsOf(file),
          report: (span, message, help) => found.push(diagnosticAt(rule.name, file.name, locate, span, message, help)),
        };
        return { rule, context };
      });

    for (const { rule, context } of active) rule.file?.(context);
    const ancestors: Node[] = [];
    const walk = (node: Node): void => {
      for (const { rule, context } of active) rule.visit?.(node, context, ancestors.at(-1), ancestors);
      ancestors.push(node);
      for (const child of node.children) walk(child);
      ancestors.pop();
    };
    walk(file.root);
  }

  return found.sort(compareDiagnostics);
}

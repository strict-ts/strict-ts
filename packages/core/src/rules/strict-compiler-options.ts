import type { Rule } from '../rule.js';

/**
 * The compiler options without which the other rules prove nothing. `noPropertyAccessFromIndexSignature` is not one:
 * with `noUncheckedIndexedAccess`, a name read from a table already has `undefined` in its type, so writing it
 * `table['name']` and not `table.name` is a way of writing, which no guarantee stands on.
 */
export const requiredCompilerOptions: readonly string[] = [
  'strict',
  'noUncheckedIndexedAccess',
  'exactOptionalPropertyTypes',
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noImplicitOverride',
];

export const strictCompilerOptions: Rule = {
  name: 'strict-compiler-options',
  guarantee: 'typing',
  description: "Requires the compiler's strict options.",
  scope: 'project',
  project({ compilerOptions, report }) {
    const missing = requiredCompilerOptions.filter((option) => compilerOptions[option] !== true);
    if (missing.length === 0) return;
    report(
      `Required compiler options missing: ${missing.join(', ')}.`,
      `Add to compilerOptions: ${missing.map((option) => `"${option}": true`).join(', ')}`,
    );
  },
};

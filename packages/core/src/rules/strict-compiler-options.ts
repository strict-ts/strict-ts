import type { Rule } from '../rule.js';

/** The compiler options without which the other rules prove nothing. */
export const requiredCompilerOptions: readonly string[] = [
  'strict',
  'noUncheckedIndexedAccess',
  'exactOptionalPropertyTypes',
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noImplicitOverride',
  'noPropertyAccessFromIndexSignature',
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

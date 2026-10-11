// The rule engine. Nothing here may import from Node or from a given TypeScript version: rules read the program
// through `TypeProvider`, so moving from the TS 6 API to the TS 7.1 one rewrites no rule.

export { type Assumption, type Config, assumptions, defaultConfig, isPure, isTest, isUnsafe } from './config.js';
export { type Diagnostic, type Position, compareDiagnostics, diagnosticAt, locator } from './diagnostic.js';
export { type Effect, type Evidence, type Ledger, quietAsWritten, threatOf, type Written } from './effects/ledger.js';
export { hasShape, type Shape } from './effects/shapes.js';
export { ledger as effectsLedger } from './effects/index.js';
export { check } from './engine.js';
export type { Callee, ExportedValue, Origin, SourceFile, Type, TypeProvider } from './provider.js';
export type { FileContext, Guarantee, ProjectContext, Report, Rule, Scope } from './rule.js';
export { rules } from './rules/index.js';
export { type Match, matchesOf } from './rules/matches.js';
export { DIRECTIVE as tsDirectivePattern } from './rules/no-ts-directive.js';
export { requiredCompilerOptions } from './rules/strict-compiler-options.js';
export type { Node, NodeKind, Span } from './syntax.js';

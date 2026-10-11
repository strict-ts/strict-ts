// The rule engine. Nothing here may import from Node or from a given TypeScript version: rules read the program
// through `TypeProvider`, so moving from the TS 6 API to the TS 7.1 one rewrites no rule.

/** The five Rust guarantees strict-ts brings to TypeScript; every rule serves one of them. */
export type Guarantee = 'memory' | 'typing' | 'errors' | 'mutability' | 'ownership';

export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface Diagnostic {
  readonly rule: string;
  readonly file: string;
  readonly start: Position;
  readonly end: Position;
  readonly message: string;
  /** What to write instead, in the manner of rustc's `help:`. */
  readonly help?: string;
}

/** How the rules reach the compiler. One implementation per TypeScript API (TS 6 today, TS 7.1 when it ships). */
export interface TypeProvider {
  readonly files: readonly string[];
}

export interface Rule {
  readonly name: string;
  readonly guarantee: Guarantee;
  readonly check: (provider: TypeProvider) => readonly Diagnostic[];
}

export function check(provider: TypeProvider, rules: readonly Rule[]): readonly Diagnostic[] {
  return rules.flatMap((rule) => rule.check(provider));
}

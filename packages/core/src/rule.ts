import type { Config } from './config.js';
import type { Callee, ExportedValue, SourceFile, Type } from './provider.js';
import type { Node, Span } from './syntax.js';

/** The five Rust guarantees strict-ts brings to TypeScript; every rule serves one of them. */
export type Guarantee = 'memory' | 'typing' | 'errors' | 'mutability' | 'ownership';

/** Where a rule runs: outside the unsafe directories, inside them, in every file, or once for the project. */
export type Scope = 'safe' | 'unsafe' | 'all' | 'project';

export type Report = (span: Span, message: string, help: string) => void;

export interface FileContext {
  readonly file: SourceFile;
  readonly config: Config;
  readonly typeOf: (node: Node) => Type;
  readonly calleeOf: (node: Node) => Callee | undefined;
  readonly isOwnModule: (specifier: Node) => boolean;
  readonly expectedOf: (node: Node) => Type | undefined;
  readonly asksForMutation: (node: Node) => boolean;
  readonly valuesOf: (node: Node) => readonly unknown[] | undefined;
  readonly exports: () => readonly ExportedValue[];
  readonly report: Report;
}

export interface ProjectContext {
  readonly config: Config;
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly declarationFiles: readonly string[];
  /** Reports about the project as a whole, or about `file` when one is given. */
  readonly report: (message: string, help: string, file?: string) => void;
}

export interface Rule {
  readonly name: string;
  readonly guarantee: Guarantee;
  readonly description: string;
  readonly scope: Scope;
  /**
   * `false` for a rule that does not run in a test: one about exceptions, which a test is free to raise, or about
   * what may be imported. Every other rule runs in tests as anywhere.
   */
  readonly inTests?: false;
  /**
   * Called for every node of a file, parents first. `parent` is absent for the root; `ancestors` goes from the root
   * down to the parent.
   */
  readonly visit?: (node: Node, context: FileContext, parent: Node | undefined, ancestors: readonly Node[]) => void;
  /** Called once per file. */
  readonly file?: (context: FileContext) => void;
  /** Called once per run, whatever the rule's scope. */
  readonly project?: (context: ProjectContext) => void;
}

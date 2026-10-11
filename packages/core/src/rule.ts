import type { Config } from './config.js';
import type { ExportedValue, SourceFile, Type } from './provider.js';
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
  readonly exports: () => readonly ExportedValue[];
  readonly report: Report;
}

export interface ProjectContext {
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly report: (message: string, help: string) => void;
}

export interface Rule {
  readonly name: string;
  readonly guarantee: Guarantee;
  readonly description: string;
  readonly scope: Scope;
  /** Called for every node of a file, parents first. `parent` is absent for the root. */
  readonly visit?: (node: Node, context: FileContext, parent: Node | undefined) => void;
  /** Called once per file. */
  readonly file?: (context: FileContext) => void;
  /** Called once, for rules of scope `project`. */
  readonly project?: (context: ProjectContext) => void;
}

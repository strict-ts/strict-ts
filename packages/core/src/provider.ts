import type { Diagnostic } from './diagnostic.js';
import type { Node, Span } from './syntax.js';

/** What a rule may ask about a type. Every answer comes from the compiler; a provider never guesses. */
export interface Type {
  /** The type as the compiler prints it. */
  readonly text: string;
  readonly isAny: boolean;
  /** A string, number, boolean or enum literal, or `undefined`: a member a finite union can be made of. */
  readonly isLiteral: boolean;
  readonly isBooleanLiteral: boolean;
  /** `Promise` or `PromiseLike`. */
  readonly isPromise: boolean;
  /** The members of a union, or the type itself. */
  readonly members: readonly Type[];
  /** What `await` gives for a promise; the type itself otherwise. */
  readonly awaited: Type;
  readonly property: (name: string) => Type | undefined;
  /** The types of every property. */
  readonly properties: readonly Type[];
  /** The return type of each call signature; empty when the type is not callable. */
  readonly returns: readonly Type[];
}

export interface SourceFile {
  /** The path shown in diagnostics, relative to the project root, with `/` separators. */
  readonly name: string;
  readonly text: string;
  readonly root: Node;
}

/** A value a module exports, with the span of its name. */
export interface ExportedValue extends Span {
  readonly name: string;
  readonly type: Type;
}

/**
 * How the rules reach the compiler. One implementation per TypeScript API (TS 6 today, TS 7.1 when it ships);
 * moving from one to the other rewrites no rule.
 */
export interface TypeProvider {
  /** The files to check: the project's own sources, without declaration files and dependencies. */
  readonly files: readonly SourceFile[];
  /** The compiler options in force, by name. */
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  /** What the compiler itself refuses (rule `TS<code>`): strict-ts replaces `tsc --noEmit`. */
  readonly compilerDiagnostics: readonly Diagnostic[];
  readonly typeOf: (node: Node) => Type;
  readonly exportsOf: (file: SourceFile) => readonly ExportedValue[];
}

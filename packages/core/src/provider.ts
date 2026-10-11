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
  /**
   * A plain value, by its type: a string, a number, a boolean, a bigint, null or undefined, a union of those, or an
   * array of those; a brand on one (`string & { … }`) leaves it plain. Converting one to text or to a number does
   * not throw.
   */
  readonly isPlain: boolean;
  /**
   * The kinds of value the type admits, one for each member of a union: `string`, `number`, `bigint`, `boolean`,
   * `symbol`, `undefined`, `null`, `array` (an array of plain values), the name of a class of the compiler's own
   * libraries (`Date`, `Map`), or `object` for anything else. A type parameter admits what its constraint does.
   */
  readonly kinds: readonly string[];
  /** Marked `Once<…>`: a value with one owner, given away exactly once. True of a union when a member is. */
  readonly isOnce: boolean;
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

/** Where the function a call reaches is declared, which decides what can be known about it. */
export type Origin =
  /** In the checked files: the rules read it. */
  | { readonly kind: 'project' }
  /** In the compiler's own libraries: the JavaScript standard library, the DOM. */
  | { readonly kind: 'library' }
  /** In a dependency, or in any other declaration file; `package` is its name when it can be told. */
  | { readonly kind: 'package'; readonly package: string | undefined };

/** The function a call or a `new` reaches. */
export interface Callee {
  /** `Owner.member` for a method (`Date.toISOString`), `Owner.new` for a constructor, the bare name for a function. */
  readonly name: string;
  readonly origin: Origin;
}

/**
 * How the rules reach the compiler. One implementation per TypeScript API (TS 6 today, TS 7.1 when it ships);
 * moving from one to the other rewrites no rule.
 */
export interface TypeProvider {
  /** The files to check: the project's own sources, without declaration files and dependencies. */
  readonly files: readonly SourceFile[];
  /**
   * The project's own declaration files (`.d.ts` under its root), by the path shown in diagnostics. They are compiled
   * and not checked: what they declare is taken on trust.
   */
  readonly declarationFiles: readonly string[];
  /** The compiler options in force, by name. */
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  /** What the compiler itself refuses (rule `TS<code>`): strict-ts replaces `tsc --noEmit`. */
  readonly compilerDiagnostics: readonly Diagnostic[];
  readonly typeOf: (node: Node) => Type;
  readonly exportsOf: (file: SourceFile) => readonly ExportedValue[];
  /**
   * What a `call` or `new` node reaches (a tagged template is a call), when the compiler can tell. Absent for a value called as a function without
   * a declaration behind it.
   */
  readonly calleeOf: (node: Node) => Callee | undefined;
  /**
   * The type the place of an expression expects: the type of the parameter for an argument, the return type of the
   * function for a returned value, the declared type for an initializer. Absent where nothing is expected.
   */
  readonly expectedOf: (node: Node) => Type | undefined;
}

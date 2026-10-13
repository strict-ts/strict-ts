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
  /** An array or a tuple, read-only or not: what an index, and a pattern in brackets, read soundly. */
  readonly isArray: boolean;
  /** A tuple: its length is part of its type. */
  readonly isTuple: boolean;
  /** A table: an object with an index signature on texts (`Record<string, T>`, `{ [key: string]: T }`). */
  readonly isIndexed: boolean;
  /** The instances of a class. */
  readonly isClass: boolean;
  /** The members of a union, or the type itself. */
  readonly members: readonly Type[];
  /** What `await` gives for a promise; the type itself otherwise. */
  readonly awaited: Type;
  readonly property: (name: string) => Type | undefined;
  /** The names of the properties that cannot be written: declared `readonly`, or made so by `Readonly<…>`. */
  readonly readonlyProperties: readonly string[];
  /** The names of the properties whose type is written `Mut<…>`: those the project says it writes. */
  readonly mutableProperties: readonly string[];
  /** The names of the properties that may be absent (`name?: T`). */
  readonly optionalProperties: readonly string[];
  /** The names of every property. */
  readonly propertyNames: readonly string[];
  /** The types of every property. */
  readonly properties: readonly Type[];
  /** For an array or a tuple: the type of what it holds. */
  readonly element: Type | undefined;
  /** The return type of each call signature; empty when the type is not callable. */
  readonly returns: readonly Type[];
  /**
   * For a function: the positions of the parameters whose type is written `Mut<…>`, in its first signature. Those
   * it says it writes into.
   */
  readonly mutableParameters: readonly number[];
  /** For a function: the types of the parameters of its first signature, without `this`. */
  readonly parameterTypes: readonly Type[];
  /**
   * For a function type: whether it is written in the project (a function, or a type of function such as
   * `(cart: Cart) => void`). One of the library says nothing of `Mut<…>` either way.
   */
  readonly isWrittenInProject: boolean;
  /**
   * For a function: the positions of the parameters of its first signature that are declared with a default, and
   * of those that may be given `undefined` on purpose (their type says so, and they are not merely optional).
   */
  readonly defaultedParameters: readonly number[];
  readonly undefinedParameters: readonly number[];
  /** For a function: whether its first signature is written with a body, in the checked files: what it does can be read. */
  readonly isImplemented: boolean;
  /**
   * The type carries the mark of `Mut<…>`: the compiler gives nothing there that does not carry it too. Of a type
   * that may be nothing (`Mut<Cart> | undefined`), each of the others carries it.
   */
  readonly isMut: boolean;
  /** For a function: whether the return type written for its first signature says `Mut<…>` somewhere. */
  readonly mutableReturn: boolean;
  /** For a function whose first signature says `this: Mut<…>`: the type it asks its receiver to have. */
  readonly mutableReceiver: Type | undefined;
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
  /**
   * The package the called name is imported from, when it is imported from one: `vue` for `ref`, which
   * `@vue/reactivity` declares, and the same for a global declared as `typeof import('vue').ref`. A package is
   * allowed for what it exports, wherever it keeps it.
   */
  readonly importedFrom?: string;
  /**
   * For a function of the project: the file its signature is written in, as diagnostics show it. A rule tells from
   * it whether the function lives in an unsafe directory.
   */
  readonly declaredIn?: string;
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
  /**
   * For each checked file, by the path shown in diagnostics, the checked files it imports for their values (an
   * `import type` runs nothing). What the files of a project ask of each other when they start.
   */
  readonly imports: Readonly<Record<string, readonly string[]>>;
  /**
   * The sources of the project that no rule reads because the compiler does not: single-file components, by the
   * path shown in diagnostics. Empty for a host that did not look for them.
   */
  readonly unreadSources: readonly string[];
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
   * Whether the module a specifier names is one of the project's own sources, which the rules read, as a path alias
   * of the configuration (`@/lib/types`) is. False for a declaration file, and when the compiler does not resolve it.
   */
  readonly isOwnModule: (specifier: Node) => boolean;
  /** Whether a specifier names one of the unread sources, by a relative path or by a path alias. */
  readonly isUnreadSource: (specifier: Node) => boolean;
  /**
   * The type the place of an expression expects: the type of the parameter for an argument, the return type of the
   * function for a returned value, the declared type for an initializer. Absent where nothing is expected.
   */
  readonly expectedOf: (node: Node) => Type | undefined;
  /**
   * Whether the place of an expression expects a type that accepts more than the expression's own: a
   * `(string | number)[]` where a `string[]` is given. False where nothing is expected.
   */
  readonly isWidened: (node: Node) => boolean;
  /**
   * Every value an expression can have, when the compiler knows them all: a literal, a constant of a literal type, a
   * union of those, an object or an array made of those, a regular expression. Absent for anything else, and past
   * 16 values.
   */
  readonly valuesOf: (node: Node) => readonly unknown[] | undefined;
  /**
   * Whether the place of an expression is declared with `Mut<…>`: the parameter it is an argument for, the variable
   * it initializes, the return type of the function it is returned from.
   */
  readonly asksForMutation: (node: Node) => boolean;
  /**
   * Whether the place a value is given to says `Mut<…>` of what the value holds, and not only of the value: the
   * elements of a list (`readonly Mut<Line>[]`), a property that holds an object (`{ cart: Mut<Cart> }`).
   */
  readonly asksForMutationInside: (node: Node) => boolean;
}

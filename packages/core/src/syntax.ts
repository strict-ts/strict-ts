// The syntax the rules read. It names only what a rule needs to tell apart; everything else is `other`.
// A TypeProvider builds this tree from its own compiler's nodes, so no rule ever sees a compiler node.

/** Offsets in the file's text, in UTF-16 code units; `end` is exclusive. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

interface NodeBase extends Span {
  readonly children: readonly Node[];
  /**
   * Whether the node is a statement, a declaration or a member of a class or of a type: the smallest piece of code
   * a comment on the line above is about.
   */
  readonly isUnit: boolean;
}

export type Node = NodeBase &
  (
    | { readonly kind: 'other' }
    | { readonly kind: 'any-keyword' }
    | { readonly kind: 'null-keyword' }
    | { readonly kind: 'import-keyword' }
    | { readonly kind: 'this' }
    /**
     * `declaredOutside`: the name refers to a value declared outside the checked files (a declaration file, a
     * dependency), so nothing checked where its type comes from.
     */
    | {
        readonly kind: 'identifier';
        readonly text: string;
        readonly declaredOutside: boolean;
        /**
         * Whether the name refers to a parameter of a function (or to a piece destructured from one), and whether
         * that parameter's type asks for mutation with `Mut<…>`.
         */
        readonly parameter: 'none' | 'readonly' | 'mutable';
        /**
         * Where the variable or the parameter the name refers to is declared, as an offset in this file: two names
         * with the same offset are the same variable. Absent for anything else.
         */
        readonly declaredAt: number | undefined;
        /** Read here with a type narrower than the one it is declared with: a test before it said more. */
        readonly isNarrowed: boolean;
      }
    | { readonly kind: 'string-literal'; readonly text: string }
    /** An object or an array written in place: `{ … }`, `[ … ]`. Nobody else holds it yet. */
    | { readonly kind: 'literal'; readonly entries: readonly LiteralEntry[] }
    /** `condition ? whenTrue : whenFalse`. */
    | { readonly kind: 'conditional'; readonly whenTrue: Node; readonly whenFalse: Node }
    /** A block of statements, or a whole file: its children run one after the other, and names declared in it end with it. */
    | { readonly kind: 'block' }
    /** Parentheses, a `const`/`let` statement and its list of declarations: children that run one after the other, each once. */
    | { readonly kind: 'sequence' }
    /** One declared variable: `name = initializer`. `name` is an identifier, or a pattern (`other`). */
    | {
        readonly kind: 'variable';
        readonly name: Node;
        readonly isConst: boolean;
        readonly initializer: Node | undefined;
        /** A `let` or a `var` of a statement, declared with no value: it gets one later, by an assignment. */
        readonly waitsForValue: boolean;
      }
    /**
     * A function, an arrow, a method, a constructor or an accessor. `parameters` are their names (or patterns).
     * `isOverload` for a signature with no body that an implementation follows: not an abstract method, and not a
     * declaration of what is defined elsewhere. `name` for a function or a method declared with one.
     */
    | { readonly kind: 'function'; readonly parameters: readonly Node[]; readonly body: Node | undefined; readonly isOverload: boolean; readonly isConstructor: boolean; readonly name: string | undefined }
    /** `if (condition) whenTrue else whenFalse`. */
    | { readonly kind: 'if'; readonly condition: Node; readonly whenTrue: Node; readonly whenFalse: Node | undefined }
    | { readonly kind: 'return'; readonly expression: Node | undefined }
    /** A call. A tagged template is one too: its arguments are the template, then each substitution. */
    | { readonly kind: 'call'; readonly callee: Node; readonly arguments: readonly Node[] }
    /** `new Callee(…)`, with the number of arguments written. */
    | { readonly kind: 'new'; readonly callee: Node; readonly argumentCount: number; readonly arguments: readonly Node[] }
    /** A `let` or `var` statement at the top level of a module: state every importer shares. */
    | { readonly kind: 'module-state' }
    /** `object.name`; parentheses around `object` are looked through. */
    | {
        readonly kind: 'property-access';
        readonly object: Node;
        readonly name: string;
        /**
         * When the property is a method, written with the method syntax in a class, an interface or an object: the
         * name of what declares it, or an empty text. A method reads `this`, which a call through its object gives.
         */
        readonly method: string | undefined;
        /** Read here with a type narrower than the one the property is declared with. */
        readonly isNarrowed: boolean;
        /** The property is computed each time it is read (`get name()`). */
        readonly isGetter: boolean;
      }
    /** `object[…]`. */
    | { readonly kind: 'element-access'; readonly object: Node; readonly index: Node }
    /** `x++`, `--x`. */
    | { readonly kind: 'update'; readonly operand: Node }
    /** `delete x.y`. */
    | { readonly kind: 'delete'; readonly operand: Node }
    | { readonly kind: 'await' }
    | { readonly kind: 'void' }
    | { readonly kind: 'non-null' }
    /** `let x!: T` or a class property `x!: T`: a promise that it is assigned, which nobody checks. */
    | { readonly kind: 'definite-assignment' }
    /** A written `x is T` or `asserts x is T`. A predicate the compiler infers has no node. */
    | { readonly kind: 'type-predicate'; readonly asserts: boolean }
    /** `T[]` or a tuple; `isReadonly` when written `readonly T[]`. */
    | { readonly kind: 'array-type'; readonly isReadonly: boolean }
    /** A type named in a type position: `Map<K, V>` has the name `Map`. */
    | { readonly kind: 'type-reference'; readonly name: string }
    /**
     * A property of an interface, of a type literal or of a class, an index signature, or a constructor parameter
     * that declares a property. `asksForMutation` when its type is written `Mut<…>`.
     */
    | {
        readonly kind: 'property';
        readonly name: string;
        readonly isReadonly: boolean;
        readonly asksForMutation: boolean;
        /** Of a class: it holds a value. Not of an interface or a type, which only say what a value has. */
        readonly holdsValue: boolean;
      }
    /** An enum. `isNumeric` unless every member is given a text written as a literal. */
    | { readonly kind: 'enum'; readonly isNumeric: boolean }
    /** A member of an interface or of a type literal written with the method syntax: `name(x: T): R`. */
    | { readonly kind: 'method-signature' }
    /** A declaration under `declare`: it states a type for something defined elsewhere. */
    | { readonly kind: 'ambient-declaration' }
    /** `x as T`; `isConst` for `x as const`. */
    | { readonly kind: 'as'; readonly isConst: boolean }
    /** `<T>x`. */
    | { readonly kind: 'type-assertion' }
    /** `operator` is the token as written: `===`, `+`, `??`… */
    | { readonly kind: 'binary'; readonly operator: string; readonly left: Node; readonly right: Node }
    /** `+x`, `-x`, `~x`, `!x`. */
    | { readonly kind: 'unary'; readonly operator: string; readonly operand: Node }
    /** A template with substitutions, not handed to a tag: each `parts` is converted to text. */
    | { readonly kind: 'template'; readonly parts: readonly Node[] }
    | { readonly kind: 'throw' }
    /** A `try` statement: its guarded block, and whether a `catch` clause takes what it throws. */
    | { readonly kind: 'try'; readonly block: Node; readonly hasCatch: boolean }
    | { readonly kind: 'expression-statement'; readonly expression: Node }
    | { readonly kind: 'switch'; readonly expression: Node; readonly clauses: readonly Node[] }
    | { readonly kind: 'case-clause'; readonly expression: Node }
    | { readonly kind: 'default-clause' }
    /**
     * A declaration that names a module: `import … from`, `export … from`, `import x = require(…)`, `import("…")`
     * in a type. `specifier` is absent when the declaration names none (`export { a }`).
     */
    | { readonly kind: 'module-reference'; readonly specifier: Node | undefined }
  );

export type NodeKind = Node['kind'];

/**
 * One member of an object written in place, in the order written: a property with its name (absent when the name is
 * computed), or a spread with what is spread. An array written in place has none.
 */
export interface LiteralEntry {
  readonly name: string | undefined;
  readonly spread: Node | undefined;
}

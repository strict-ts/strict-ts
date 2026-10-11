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
      }
    | { readonly kind: 'string-literal'; readonly text: string }
    | { readonly kind: 'call'; readonly callee: Node; readonly arguments: readonly Node[] }
    | { readonly kind: 'new' }
    /** `object.name`; parentheses around `object` are looked through. */
    | { readonly kind: 'property-access'; readonly object: Node; readonly name: string }
    /** `object[…]`. */
    | { readonly kind: 'element-access'; readonly object: Node }
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
    | { readonly kind: 'property'; readonly name: string; readonly isReadonly: boolean; readonly asksForMutation: boolean }
    /** A declaration under `declare`: it states a type for something defined elsewhere. */
    | { readonly kind: 'ambient-declaration' }
    /** `x as T`; `isConst` for `x as const`. */
    | { readonly kind: 'as'; readonly isConst: boolean }
    /** `<T>x`. */
    | { readonly kind: 'type-assertion' }
    /** `operator` is the token as written: `===`, `+`, `??`… */
    | { readonly kind: 'binary'; readonly operator: string; readonly left: Node }
    | { readonly kind: 'throw' }
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

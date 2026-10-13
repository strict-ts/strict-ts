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
     * `this`. `receiver` says whether what it stands for may be written here: `mutable` in a constructor, in a
     * setter, in the value a property is declared with, and in a function that says `this: Mut<…>`; `readonly` in
     * any other function, Rust's `&self`.
     */
    | { readonly kind: 'this'; readonly receiver: 'mutable' | 'readonly' }
    /**
     * A statement that runs its body again: `for`, `for … of`, `for … in`, `while`, `do`. `once` is the part that
     * runs a single time, before the first turn: what a `for … of` goes through, what a `for` starts with.
     * `target` is what each turn writes, when it is a place and not a declared variable (`for (a.b of list)`).
     */
    | { readonly kind: 'loop'; readonly once: Node | undefined; readonly target: Node | undefined }
    /**
     * `declaredOutside`: the name refers to a value declared outside the checked files (a declaration file, a
     * dependency), so nothing checked where its type comes from.
     */
    | {
        readonly kind: 'identifier';
        readonly text: string;
        readonly declaredOutside: boolean;
        /**
         * For a name of a value another file of the project made at its top level: whether its declaration says
         * `Mut<…>`. Absent for anything else: a name of this file, a function, a class.
         */
        readonly fromModule: 'mutable' | 'readonly' | undefined;
        /**
         * Whether the name refers to a parameter of a function (or to a piece destructured from one), and whether
         * that parameter's type asks for mutation with `Mut<…>`.
         */
        readonly parameter: 'none' | 'readonly' | 'mutable';
        /**
         * Where the variable, the parameter or the declared function the name refers to is declared, as an offset in
         * this file: two names with the same offset are the same one. Absent for anything else.
         */
        readonly declaredAt: number | undefined;
        /** Read here with a type narrower than the one it is declared with: a test before it said more. */
        readonly isNarrowed: boolean;
        /**
         * The place the name is given to takes the whole of the type it is declared with (a parameter typed with
         * it, a constant declared with it): nothing there relies on what a test said.
         */
        readonly takesDeclared: boolean;
        /**
         * For a name declared with a written type that is a list, a map or a set: whether what it holds may be
         * written into. `Mut<Line[]>` says the list may be written, and not the lines: `readonly` here. A type that
         * says `Mut<…>` inside (`Mut<Mut<Line>[]>`, `readonly Mut<Line>[]`) says they may: `writable`. `unknown`
         * when no type is written for it.
         */
        readonly elements: 'writable' | 'readonly' | 'unknown';
        /** The same, one list further in at each position: of what the lists it holds hold, and so on. */
        readonly elementsDeep: readonly ('writable' | 'readonly' | 'unknown')[];
        /**
         * What a local name may stand for, when it was made from other places: `const a = b.c`, a piece taken out
         * by a pattern, the variable of a `for … of`, a variable assigned to later. Empty for a parameter, and for
         * a local made of something new. Computed on demand.
         */
        readonly aliasOf: readonly Alias[];
        /**
         * For a constant made of the rest of an object (`const { a, b: c, ...rest } = value`), the names the pattern
         * took out: the constant holds none of them, whatever its type says. Empty for anything else.
         */
        readonly leftOut: readonly string[];
      }
    | { readonly kind: 'string-literal'; readonly text: string }
    /** An object or an array written in place: `{ … }`, `[ … ]`. Nobody else holds it yet. */
    | {
        readonly kind: 'literal';
        readonly entries: readonly LiteralEntry[];
        /** The places whose content an object or an array written in place shares: what is spread or put in it. */
        readonly madeFrom: readonly Alias[];
        /** Those of what is spread in it only: what is put in it by name or by position is a value given on its own. */
        readonly spreadFrom: readonly Alias[];
      }
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
        /** The names of its pattern whose default hides an `undefined`: see `hiddenDefaults` of a function. */
        readonly hiddenDefaults: readonly Node[];
      }
    /**
     * A function, an arrow, a method, a constructor or an accessor. `parameters` are their names (or patterns).
     * `isOverload` for a signature with no body that an implementation follows: not an abstract method, and not a
     * declaration of what is defined elsewhere. `name` for a function or a method declared with one.
     * `hiddenDefaults`: the parameters, and the names their patterns take out, that are written with a default
     * other than `undefined` while their type lets a caller give `undefined` on purpose. The default runs then, and
     * what was given never arrives. A place that is only optional (`name?: T`) is not one: nothing is given there.
     */
    | {
        readonly kind: 'function';
        readonly hiddenDefaults: readonly Node[];
        readonly parameters: readonly Node[];
        readonly body: Node | undefined;
        readonly isOverload: boolean;
        readonly isConstructor: boolean;
        readonly name: string | undefined;
        /**
         * A method the language calls without its name being written: `[Symbol.iterator]`, `toString`, `valueOf`,
         * `toJSON`, `then`. A loop, a template, `JSON.stringify` or `await` runs it on whatever object it is given.
         */
        readonly isProtocol: boolean;
        /**
         * For a method of a class: what the members of the same name say of `Mut<…>` in the classes it extends and
         * the interfaces it implements. A caller that holds the object under one of those types sees only that.
         */
        readonly overridden: readonly { readonly mutableReceiver: boolean; readonly mutableParameters: readonly number[] }[];
      }
    /** `if (condition) whenTrue else whenFalse`. */
    | { readonly kind: 'if'; readonly condition: Node; readonly whenTrue: Node; readonly whenFalse: Node | undefined }
    | { readonly kind: 'return'; readonly expression: Node | undefined }
    /**
     * A call. A tagged template is one too: its arguments are the template, then each substitution. `hasSpread`: an
     * argument is written `...list`, so how many the function receives is not what is counted here.
     */
    | {
        readonly kind: 'call';
        readonly callee: Node;
        readonly arguments: readonly Node[];
        readonly hasSpread: boolean;
        /**
         * The places whose content what the call gives back shares, when the callee is a method of a collection of
         * the library that is known to hand out what it holds (`list.find(…)`, `list.slice()`). Empty for any other
         * call: what it gives is the callee's to say.
         */
        readonly madeFrom: readonly Alias[];
        /**
         * Whether what the list, the map or the set the call gives back holds may be written into, by the return
         * type its function of the project is written with. `unknown` for a function that is not the project's.
         */
        readonly elements: 'writable' | 'readonly' | 'unknown';
        /** The same, one list further in at each position. */
        readonly elementsDeep: readonly ('writable' | 'readonly' | 'unknown')[];
      }
    /** `new Callee(…)`, with the number of arguments written. */
    | {
        readonly kind: 'new';
        readonly callee: Node;
        readonly argumentCount: number;
        readonly arguments: readonly Node[];
        readonly hasSpread: boolean;
        /** For a collection of the library made from another one (`new Map(other)`): the places whose content it shares. */
        readonly madeFrom: readonly Alias[];
      }
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
        /** The place the property is given to takes the whole of the type it is declared with. */
        readonly takesDeclared: boolean;
        /** The property is computed each time it is read (`get name()`). */
        readonly isGetter: boolean;
        /**
         * Whether what the property holds may be written into, as far as its declaration says: `writable` when its
         * written type says `Mut<…>` somewhere, or when it is declared with no type and something made in place
         * (`readonly party = new Party()`); `readonly` when the project declares it otherwise; `unknown` for a
         * property of a library, of an object written in place, or one that is not declared as a property.
         */
        readonly holds: 'writable' | 'readonly' | 'unknown';
        /** The name is not one the type declares: it is read out of a table (`Record<string, T>`), as `table[name]` is. */
        readonly byIndex: boolean;
        /**
         * For a value another file of the project made, reached as a property: of a namespace (`import * as state`)
         * or of a class (`Shop.shared`, a static field). Whether its declaration says `Mut<…>`; absent otherwise.
         */
        readonly fromModule: 'mutable' | 'readonly' | undefined;
        /** For a field declared with no type: the places whose content the value it is declared with shares. */
        readonly madeFrom: readonly Alias[];
        /** The same question as `elements` of a name, for a field that is a list, a map or a set. */
        readonly elements: 'writable' | 'readonly' | 'unknown';
        /** The same, one list further in at each position: of what the lists it holds hold, and so on. */
        readonly elementsDeep: readonly ('writable' | 'readonly' | 'unknown')[];
        /** For a getter written in the project: the file it is written in, as diagnostics show it. */
        readonly getterIn: string | undefined;
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
    /** `typeof f` in a type position: the type of a value is asked, and the value is not read. */
    | { readonly kind: 'type-query' }
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
    /**
     * `left operator right`. `hiddenDefaults`: for an assignment by a pattern (`({ a = 1 } = value)`), the names
     * whose default hides an `undefined`, as for a declared variable.
     */
    | { readonly kind: 'binary'; readonly operator: string; readonly left: Node; readonly right: Node; readonly hiddenDefaults: readonly Node[] }
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
/** One of the places a local name may stand for. */
export interface Alias {
  readonly place: Node;
  /**
   * `same`: the name is the place itself. `part`: it is a property of the place, taken out by a pattern.
   * `element`: it is one of the things the place holds as a list, a map or a set (the variable of a loop over
   * it, what `find` gave). `copy`: it is a new container that holds what the place holds
   * (`slice()`, `[...place]`, the rest of a pattern): writing the container is not writing the place, writing
   * into what it holds is. `result`: it is what a call gave back, and `place` is the call.
   */
  readonly as: 'same' | 'part' | 'element' | 'copy' | 'result';
}

export interface LiteralEntry {
  readonly name: string | undefined;
  /** The key of a property written `[key]: value`, when it is computed and not a name written in place. */
  readonly key: Node | undefined;
  readonly spread: Node | undefined;
}

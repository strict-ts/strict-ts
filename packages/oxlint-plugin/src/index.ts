// The rules of strict-ts that need no type, as an Oxlint plugin: Oxlint parses in parallel and natively, so these
// three run far faster than through the TypeScript API. They refuse the same code, at the same places, as the rules
// of the same name in @strict-ts/core; a test compares the two on real projects.
import { isUnsafe, tsDirectivePattern } from '@strict-ts/core';

/** The little of the ESLint rule API that these rules use, which is what Oxlint gives a JavaScript plugin. */
interface Position {
  readonly line: number;
  readonly column: number;
}
interface Node {
  readonly type: string;
  readonly raw?: string;
  readonly operator?: string;
  readonly parent?: Node;
}
interface Context {
  readonly filename: string;
  readonly cwd: string;
  readonly options: readonly unknown[];
  readonly sourceCode: { readonly text: string; readonly getLocFromIndex: (index: number) => Position };
  readonly report: (
    problem: { readonly message: string } & ({ readonly node: Node } | { readonly loc: { readonly start: Position; readonly end: Position } }),
  ) => void;
}
interface Rule {
  readonly meta: { readonly type: 'problem'; readonly schema: readonly unknown[] };
  readonly create: (context: Context) => Readonly<Record<string, (node: Node) => void>>;
}

/** `{ "unsafeDirs": ["src/unsafe"] }` as the rule's first option; the default of strict-ts.json when absent. */
const unsafeDirs = (context: Context): readonly string[] => {
  const [first] = context.options;
  if (typeof first !== 'object' || first === null || !('unsafeDirs' in first) || !Array.isArray(first.unsafeDirs)) return ['src/unsafe'];
  const dirs: readonly unknown[] = first.unsafeDirs;
  return dirs.flatMap((dir) => (typeof dir === 'string' ? [dir] : []));
};

/** Whether the file sits in an unsafe directory, by its path from where Oxlint runs. */
const inUnsafe = (context: Context): boolean => {
  const root = `${context.cwd.replaceAll('\\', '/').replace(/\/+$/, '')}/`;
  const file = context.filename.replaceAll('\\', '/');
  return isUnsafe(file.startsWith(root) ? file.slice(root.length) : file, { unsafeDirs: unsafeDirs(context), allowedImports: [] });
};

const options = [{ type: 'object', properties: { unsafeDirs: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }];
const EQUALITY = new Set(['===', '!==', '==', '!=']);

const noThrow: Rule = {
  meta: { type: 'problem', schema: options },
  create: (context) =>
    inUnsafe(context)
      ? {}
      : {
          ThrowStatement: (node) => context.report({ node, message: '`throw` is forbidden. Return `err(...)` and declare the error in the type: Result<T, E>.' }),
        },
};

const noNull: Rule = {
  meta: { type: 'problem', schema: options },
  create: (context) => {
    if (inUnsafe(context)) return {};
    const message = '`null` is forbidden. Use Option<T> (or `undefined` for an optional property).';
    return {
      // A comparison with null stays allowed, to narrow an unknown.
      Literal: (node) => {
        if (node.raw !== 'null') return;
        if (node.parent?.type === 'BinaryExpression' && EQUALITY.has(node.parent.operator ?? '')) return;
        context.report({ node, message });
      },
      TSNullKeyword: (node) => context.report({ node, message }),
    };
  },
};

const noTsDirective: Rule = {
  meta: { type: 'problem', schema: [] },
  create: (context) => ({
    Program: () => {
      const { text, getLocFromIndex } = context.sourceCode;
      for (const match of text.matchAll(tsDirectivePattern)) {
        const start = getLocFromIndex(match.index);
        const end = getLocFromIndex(match.index + match[0].length);
        context.report({ loc: { start, end }, message: `@ts-${match[1] ?? ''} is forbidden. Fix the type error instead of hiding it.` });
      }
    },
  }),
};

const plugin: { readonly meta: { readonly name: string }; readonly rules: Readonly<Record<string, Rule>> } = {
  meta: { name: 'strict-ts' },
  rules: { 'no-throw': noThrow, 'no-null': noNull, 'no-ts-directive': noTsDirective },
};

export default plugin;

// Runs the operators of the language on every kind of operand, and keeps the combinations that threw and that the
// compiler accepts. A call is not the only thing that can throw: `1n / 0n` does, and so does `${value}` on an
// object without a prototype.
import ts from '@typescript/typescript6';
import { show } from './values.mjs';

/** A kind of operand: the values it is run on, and the types it is written with when the compiler is asked. */
const KINDS = {
  string: { values: ['', 'a', '12', '-3.5', '1n', ' '], types: ['string'] },
  number: { values: [0, 1, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, 31, 32, -5], types: ['number'] },
  bigint: { values: [0n, 1n, -1n, 2n, 64n, -3n], types: ['bigint'] },
  boolean: { values: [true, false], types: ['boolean'] },
  undefined: { values: [undefined], types: ['undefined'] },
  null: { values: [null], types: ['null'] },
  symbol: { values: [Symbol('a'), Symbol.iterator], types: ['symbol'] },
  // An array of plain values.
  array: { values: [[], [1, 2], ['a'], [[1]], [null]], types: ['readonly string[]', 'readonly (number | undefined)[]'] },
  // Anything else: what a type that is not one of the above may hold.
  object: {
    values: [{}, { a: 1 }, Object.create(null), [Object.create(null)], [Symbol('a')], () => 1, class {}],
    types: ['{ readonly a: number }', 'unknown', 'T', 'object', 'readonly unknown[]'],
  },
  // Classes of the library, which may convert where an object in general does not.
  Date: { values: [new Date(0), new Date(Number.NaN)], types: ['Date'] },
  RegExp: { values: [/a/g], types: ['RegExp'] },
  Error: { values: [new Error('a'), new TypeError('b')], types: ['Error'] },
  Map: { values: [new Map(), new Map([[1, 2]])], types: ['Map<string, number>', 'ReadonlyMap<string, number>'] },
  Set: { values: [new Set(), new Set([1])], types: ['Set<string>', 'ReadonlySet<string>'] },
};
/** The kinds named after a class: the rules tell them by the name of the type. */
export const CLASS_KINDS = Object.keys(KINDS).filter((kind) => /^[A-Z]/.test(kind));

const BINARY = ['+', '-', '*', '/', '%', '**', '<<', '>>', '>>>', '&', '|', '^', '<', '>', '<=', '>=', '==', '!=', '===', '!==', 'in', 'instanceof'];
const UNARY = ['+', '-', '~', '!', 'typeof'];

/** Past what the machine holds: not an exception of the operator. */
const LIMIT = /Maximum BigInt size exceeded|Invalid string length/;

const apply = {
  binary: Object.fromEntries(BINARY.map((operator) => [operator, new Function('a', 'b', `return a ${operator} b;`)])),
  unary: Object.fromEntries(UNARY.map((operator) => [operator, new Function('a', `return ${operator} a;`)])),
  template: (a) => `${a}`,
};

/** The first failure of `run` over the given operands, as the text of an example. */
function failure(run, written, operands) {
  for (const values of operands) {
    try {
      run(...values);
    } catch (error) {
      if (LIMIT.test(String(error?.message))) continue;
      return `${written(...values.map(show))} → ${error?.constructor?.name ?? 'Error'}`;
    }
  }
  return undefined;
}

const pairs = (left, right) => left.flatMap((a) => right.map((b) => [a, b]));

/** Every combination that threw: `{ key, example, source }`, where `source` writes it for each choice of types. */
function observed() {
  const found = [];
  const kinds = Object.entries(KINDS);
  for (const [left, a] of kinds) {
    const sources = (write) => a.types.map((type) => write(type));
    for (const operator of UNARY) {
      const example = failure(apply.unary[operator], (x) => `${operator}${x}`, a.values.map((value) => [value]));
      if (example !== undefined) found.push({ key: `${operator} ${left}`, example, sources: sources((type) => `(a: ${type}) => ${operator}a`) });
    }
    const example = failure(apply.template, (x) => `\`\${${x}}\``, a.values.map((value) => [value]));
    if (example !== undefined) found.push({ key: `template ${left}`, example, sources: sources((type) => `(a: ${type}) => \`\${a}\``) });
    for (const [right, b] of kinds) {
      for (const operator of BINARY) {
        const seen = failure(apply.binary[operator], (x, y) => `${x} ${operator} ${y}`, pairs(a.values, b.values));
        if (seen === undefined) continue;
        found.push({ key: `${operator} ${left} ${right}`, example: seen, sources: pairs(a.types, b.types).map(([l, r]) => `(a: ${l}, b: ${r}) => a ${operator} b`) });
      }
    }
  }
  return found;
}

/** Which of the given functions the compiler accepts, as written in a strict program. */
function accepted(sources) {
  const lines = sources.map((source, index) => `export const f${index} = <T,>${source};`);
  const name = '/operators.ts';
  const host = ts.createCompilerHost({});
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, ...rest) => (fileName === name ? ts.createSourceFile(name, lines.join('\n'), ts.ScriptTarget.ES2023, true) : original(fileName, ...rest));
  host.fileExists = (fileName) => fileName === name || ts.sys.fileExists(fileName);
  const program = ts.createProgram([name], { strict: true, target: ts.ScriptTarget.ES2023, noEmit: true, types: [] }, host);
  const file = program.getSourceFile(name);
  const refused = new Set(program.getSemanticDiagnostics(file).map((diagnostic) => file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line));
  return sources.map((_source, index) => !refused.has(index));
}

/**
 * The operators that throw on operands the compiler accepts: `{ '/ bigint bigint': 'throws a RangeError, as seen
 * with 1n / 0n', … }`. A key is the operator and the kinds of its operands; `template` stands for `${…}`.
 */
export function operators() {
  const found = observed();
  const flat = found.flatMap((entry) => entry.sources);
  const verdicts = accepted(flat);
  const table = {};
  let at = 0;
  for (const entry of found) {
    const compiles = entry.sources.some((_source, index) => verdicts[at + index]);
    at += entry.sources.length;
    if (!compiles) continue;
    const [seen, error] = entry.example.split(' → ');
    table[entry.key] = `throws ${/^[AEIO]/.test(error) ? 'an' : 'a'} ${error}, as seen with ${seen}`;
  }
  return { table, ran: found.length };
}

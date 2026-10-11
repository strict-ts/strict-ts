import { getters, operandClasses, operators } from '../effects/index.js';
import type { Type } from '../provider.js';
import type { Rule } from '../rule.js';
import { isCaught } from './caught.js';

/** `a /= b` computes what `a / b` does. */
const COMPOUND = /^(\+|-|\*\*?|\/|%|<<|>>>?|&|\||\^)=$/;
/** The operators the table has something against: the others need no type. */
const listed = new Set(Object.keys(operators).map((combination) => combination.slice(0, combination.indexOf(' '))));
const getterNames = new Set(Object.keys(getters).map((name) => name.slice(name.indexOf('.') + 1)));
const sameClass: Readonly<Record<string, string>> = { ReadonlyMap: 'Map', ReadonlySet: 'Set' };

/** The kinds of a type as the table names them: a class it did not run is an object like any other. */
const kindsOf = (type: Type): readonly string[] =>
  type.kinds.map((kind) => {
    if (!/^[A-Z]/.test(kind)) return kind;
    const known = sameClass[kind] ?? kind;
    return operandClasses.includes(known) ? known : 'object';
  });

/** What the table holds against an operator on operands of these types. */
function threat(operator: string, operands: readonly Type[]): string | undefined {
  const [first, second] = operands.map(kindsOf);
  if (first === undefined) return undefined;
  for (const left of first) {
    for (const key of second === undefined ? [`${operator} ${left}`] : second.map((right) => `${operator} ${left} ${right}`)) {
      const why = operators[key];
      if (why !== undefined) return why;
    }
  }
  return undefined;
}

/** A bigint written in the code that the operator accepts whatever the other operand: `x / 2n`, `x ** 3n`. */
const isSafeLiteral = (operator: string, right: Type): boolean =>
  operator === '**' ? /^\d+n$/.test(right.text) : (operator === '/' || operator === '%') && /^-?\d+n$/.test(right.text) && !/^-?0+n$/.test(right.text);

const CONVERT = 'Convert the value yourself first: `textOf(value)` from @strict-ts/std gives its text and never throws.';
const DIVIDE = 'Use `quotient`, `remainder` or `power` from @strict-ts/std, which give an Option, or write the divisor as a literal.';

export const noThrowingOperator: Rule = {
  name: 'no-throwing-operator',
  guarantee: 'errors',
  description:
    'An operator or a read that may throw on what its operands may be is caught where it is written: a bigint division, the conversion of a value that may not convert, a property that runs code.',
  scope: 'all',
  visit(node, { config, calleeOf, typeOf, report }, _parent, ancestors) {
    const caught = (): boolean => isCaught(node, ancestors, calleeOf, config);
    if (node.kind === 'binary') {
      const operator = COMPOUND.test(node.operator) ? node.operator.slice(0, -1) : node.operator;
      // An array takes as its length a whole number below 2³² and nothing else.
      if (operator === '=' && node.left.kind === 'property-access' && node.left.name === 'length') {
        const length = typeOf(node.right).text;
        const fits = /^\d+$/.test(length) && Number(length) < 2 ** 32;
        if (!fits && typeOf(node.left.object).property('push') !== undefined && !caught()) {
          report(node, 'Setting the length of an array throws a RangeError on a number that is not a length.', 'Write the length as a literal, or use `splice` or `slice`.');
        }
        return;
      }
      if (!listed.has(operator)) return;
      const right = typeOf(node.right);
      const why = threat(operator, [typeOf(node.left), right]);
      if (why === undefined || isSafeLiteral(operator, right) || caught()) return;
      report(node, `\`${operator}\` ${why}.`, why.includes('RangeError') ? DIVIDE : CONVERT);
      return;
    }
    if (node.kind === 'unary') {
      if (!listed.has(node.operator)) return;
      const why = threat(node.operator, [typeOf(node.operand)]);
      if (why !== undefined && !caught()) report(node, `\`${node.operator}\` ${why}.`, CONVERT);
      return;
    }
    if (node.kind === 'template') {
      for (const part of node.parts) {
        const why = threat('template', [typeOf(part)]);
        if (why !== undefined && !caught()) report(part, `A template ${why}.`, CONVERT);
      }
      return;
    }
    if (node.kind !== 'property-access') return;
    // In a module every function is strict, and reading these two on a strict function throws.
    if (node.name === 'caller' || node.name === 'arguments') {
      if (typeOf(node.object).returns.length > 0 && !caught()) {
        report(node, `Reading \`${node.name}\` on a function throws a TypeError.`, 'Pass what the function needs as a parameter.');
      }
      return;
    }
    // A property that runs code when read. Asked only of the names the table has: most reads need no type.
    if (!getterNames.has(node.name)) return;
    for (const kind of typeOf(node.object).kinds) {
      const why = getters[`${kind}.${node.name}`];
      if (why === undefined || caught()) continue;
      report(node, `Reading \`${kind}.${node.name}\` ${why}.`, 'Read it inside `attempt(() => …, onError)` in an unsafe directory, so that the failure becomes a Result.');
      return;
    }
  },
};

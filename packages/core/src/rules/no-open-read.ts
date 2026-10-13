import type { Rule } from '../rule.js';

/** The functions that read every property a value holds, whatever its type names. */
const READS_ALL = ['ObjectConstructor.values', 'ObjectConstructor.entries'];

/**
 * A value may hold more properties than its type names: a variable is accepted where a type with fewer is asked.
 * Two things then read them all under the type of the known ones.
 */
export const noOpenRead: Rule = {
  name: 'no-open-read',
  guarantee: 'typing',
  description:
    '`Object.values` and `Object.entries` read a table (`Record`) only, and a table is not made from a value of a type with named properties: such a value may hold more than its type names.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, calleeOf, report }, _parent, ancestors) {
    if (node.kind === 'call') {
      const callee = calleeOf(node);
      const [given] = node.arguments;
      if (callee !== undefined && callee.origin.kind === 'library' && READS_ALL.includes(callee.name) && given !== undefined) {
        const type = typeOf(given);
        // With no property named, nothing is mistyped: what comes out is `any`, which `no-any` watches.
        if (!type.isIndexed && !type.isArray && !type.isAny && type.propertyNames.length > 0) {
          report(
            node,
            'Every property of a value is read under the type of the ones its type names: it may hold others.',
            'Read the properties by their names, or keep such values in a `Record`.',
          );
        }
        return;
      }
    }
    // What can name a value someone else made: a fresh literal cannot.
    if (node.kind !== 'identifier' && node.kind !== 'property-access' && node.kind !== 'element-access' && node.kind !== 'call') return;
    // `mut({ … })` is the object written in it, which `mut-fresh` asks to be made there.
    if (node.kind === 'call' && node.callee.kind === 'identifier' && node.callee.text === 'mut') return;
    // Under a cast the type is the author's word, which `no-cast` answers for.
    if (ancestors.some((outer) => outer.kind === 'as' || outer.kind === 'type-assertion')) return;
    const wanted = expectedOf(node);
    if (wanted === undefined || !wanted.isIndexed || wanted.isArray || wanted.isAny) return;
    const type = typeOf(node);
    if (type.isIndexed || type.isAny) return;
    report(
      node,
      'A value of a type with named properties is given where a table is asked for: it may hold properties its type does not name.',
      'Build the table from the properties it needs: `{ a: value.a, b: value.b }`.',
    );
  },
};

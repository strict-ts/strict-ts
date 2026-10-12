import type { Rule } from '../rule.js';

export const mutExact: Rule = {
  name: 'mut-exact',
  guarantee: 'typing',
  description:
    'What can be written through a place has exactly the type that place asks for, where `Mut<…>` is asked and where a property that can be written is: under a wider one, a write puts in it what its holder was told it never holds.',
  scope: 'safe',
  visit(node, { typeOf, expectedOf, asksForMutation, isWidened, report }) {
    // What can name a value someone else holds: a fresh literal or a `new` cannot.
    if (node.kind !== 'identifier' && node.kind !== 'property-access' && node.kind !== 'element-access') return;
    if (!isWidened(node)) return;
    if (asksForMutation(node)) {
      report(
        node,
        'A value is given where `Mut<…>` of a wider type is asked for: a write there puts in it what its own type does not allow.',
        'Ask for the type the value has, or give a copy of it.',
      );
      return;
    }
    // Without `Mut<…>` on the place itself: a property written `Mut<…>`, asked for with a wider type than it has.
    const wanted = expectedOf(node);
    if (wanted === undefined) return;
    const given = typeOf(node);
    const wider = wanted.mutableProperties.find((name) => {
      const has = given.property(name);
      const asked = wanted.property(name);
      return has !== undefined && asked !== undefined && has.text !== asked.text;
    });
    if (wider === undefined) return;
    report(
      node,
      `A value is given where its property \`${wider}\`, typed \`Mut<…>\`, is asked for with a wider type: a write there puts in it what its own type does not allow.`,
      'Ask for the type the value has, or make the property read-only where it is asked for.',
    );
  },
};

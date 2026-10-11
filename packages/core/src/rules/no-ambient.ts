import { isUnsafe } from '../config.js';
import type { Rule } from '../rule.js';

export const noAmbient: Rule = {
  name: 'no-ambient',
  guarantee: 'typing',
  description: 'Forbids `declare` and declaration files outside unsafe/: they state types for code nobody checks.',
  scope: 'safe',
  visit(node, { report }) {
    if (node.kind === 'ambient-declaration') {
      report(
        node,
        '`declare` is forbidden: it states a type the compiler cannot check.',
        'Declare it in unsafe/ and expose a checked wrapper, or import the real definition.',
      );
    }
  },
  project({ config, declarationFiles, report }) {
    for (const file of declarationFiles) {
      if (isUnsafe(file, config)) continue;
      report(
        'Declaration file outside unsafe/: what it declares is taken on trust.',
        'Move it into an unsafe directory, beside the wrappers that use it.',
        file,
      );
    }
  },
};

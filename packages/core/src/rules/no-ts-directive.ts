import type { Rule } from '../rule.js';

const DIRECTIVE = /(?:\/\/|\/\*)\s*@ts-(ignore|expect-error|nocheck)\b/g;

export const noTsDirective: Rule = {
  name: 'no-ts-directive',
  guarantee: 'typing',
  description: 'Forbids @ts-ignore, @ts-expect-error and @ts-nocheck everywhere, unsafe/ included.',
  scope: 'all',
  file({ file, report }) {
    for (const match of file.text.matchAll(DIRECTIVE)) {
      report(
        { start: match.index, end: match.index + match[0].length },
        `@ts-${match[1] ?? ''} is forbidden.`,
        'Fix the type error instead of hiding it.',
      );
    }
  },
};

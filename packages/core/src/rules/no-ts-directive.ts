import type { Rule } from '../rule.js';

// The compiler reads a directive after `//` or `/*`, and on the last line of a block comment whatever precedes it
// there (`/** @ts-ignore */`, ` * @ts-ignore */`). A line that starts like one is refused: too many, never too few.
const DIRECTIVE = /(?:^|\/\/|\/\*)[ \t/*]*@ts-(ignore|expect-error|nocheck)\b/gm;

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

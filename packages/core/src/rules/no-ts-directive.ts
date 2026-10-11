import type { Rule } from '../rule.js';
import { matchesOf } from './matches.js';

// The compiler reads a directive after `//` or `/*`, and on the last line of a block comment whatever slashes and
// stars precede it there (a JSDoc opener, the ` * ` of a continued block). A line that starts like one is refused:
// too many, never too few.
export const DIRECTIVE = /(?:^|\/\/|\/\*)[ \t/*]*@ts-(ignore|expect-error|nocheck)\b/gm;

export const noTsDirective: Rule = {
  name: 'no-ts-directive',
  guarantee: 'typing',
  description: 'Forbids @ts-ignore, @ts-expect-error and @ts-nocheck everywhere, unsafe/ included.',
  scope: 'all',
  file({ file, report }) {
    for (const match of matchesOf(file.text, DIRECTIVE)) {
      report(
        { start: match.index, end: match.index + match.text.length },
        `@ts-${match.groups[0] ?? ''} is forbidden.`,
        'Fix the type error instead of hiding it.',
      );
    }
  },
};

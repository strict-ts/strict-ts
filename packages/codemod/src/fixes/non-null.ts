// The fix of the rule no-non-null: `value!` becomes `(value ?? panic("…"))`. What `!` claimed is now checked: where
// the value is missing after all, the program stops there and says so, in place of going on with `undefined`.
import { mut, type Mut } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import type { Fix } from '../fix.js';

/** How much of the expression the message quotes. */
const QUOTED = 60;

export function nonNullFixes(api: typeof ts, sourceFile: ts.SourceFile, file: string): readonly Fix[] {
  const fixes: Mut<Fix[]> = mut([]);
  const visit = (node: ts.Node): void => {
    if (api.isNonNullExpression(node)) {
      const start = node.getStart(sourceFile);
      const bang = node.getEnd() - 1;
      const said = node.expression.getText(sourceFile).replace(/!/g, '').replace(/\s+/g, ' ');
      const what = said.length > QUOTED ? `${said.slice(0, QUOTED)}…` : said;
      fixes.push({
        rule: 'no-non-null',
        file,
        at: start,
        needs: 'panic',
        // Two insertions around what is asserted, so that an assertion inside another keeps its own.
        edits: [
          { start, end: start, text: '(' },
          // Written between double quotes: a quote or a backslash of the expression is escaped.
          { start: bang, end: bang + 1, text: ` ?? panic("${what.replace(/[\\"]/g, '\\$&')} is missing"))` },
        ],
      });
    }
    api.forEachChild(node, visit);
  };
  visit(sourceFile);
  return fixes;
}

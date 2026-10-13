// The fix of the rule no-type-predicate: remove the written predicate of a function, so that the compiler infers it.
// It only holds when the body really is a check, which the build tells: the fix is kept only if it still compiles.
import { mut, type Mut } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import type { Fix } from '../fix.js';

export function typePredicateFixes(api: typeof ts, sourceFile: ts.SourceFile, file: string): readonly Fix[] {
  const fixes: Mut<Fix[]> = mut([]);
  const visit = (node: ts.Node): void => {
    const written = api.isFunctionLike(node) && !api.isFunctionTypeNode(node) ? node.type : undefined;
    // An assertion signature has no inferred form, and a predicate in a function type has no body to infer from.
    if (written !== undefined && api.isTypePredicateNode(written) && written.assertsModifier === undefined && (api.isFunctionDeclaration(node) || api.isMethodDeclaration(node) || api.isAccessor(node) || api.isFunctionExpression(node) || api.isArrowFunction(node)) && node.body !== undefined) {
      const text = sourceFile.text;
      // From the colon that introduces the return type to the end of the predicate.
      const colon = text.lastIndexOf(':', written.getStart(sourceFile));
      if (colon !== -1) {
        fixes.push({
          rule: 'no-type-predicate',
          file,
          at: written.getStart(sourceFile),
          edits: [{ start: colon, end: written.getEnd(), text: '' }],
        });
      }
    }
    api.forEachChild(node, visit);
  };
  visit(sourceFile);
  return fixes;
}

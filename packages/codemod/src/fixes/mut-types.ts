// The other fix of the rule readonly-types, for what the first one could not make read-only because it is written:
// `Mut<…>` around the type. The write is real; now the type says so.
import { mut, type Mut } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import type { Fix } from '../fix.js';

/**
 * A `Mut<…>` for each place in `wanted`, the places where a read-only fix was dropped: around the type of a
 * property, or around an array, a map, a set, a record. One inside another is left out: what `Mut<…>` wraps has
 * asked for mutation whole.
 */
export function mutFixes(api: typeof ts, sourceFile: ts.SourceFile, file: string, wanted: ReadonlySet<number>): readonly Fix[] {
  const fixes: Mut<Fix[]> = mut([]);
  const visit = (node: ts.Node): void => {
    const at = node.getStart(sourceFile);
    if (wanted.has(at)) {
      const isProperty = api.isPropertySignature(node) || api.isPropertyDeclaration(node) || api.isParameter(node);
      const type = isProperty ? node.type : api.isTypeNode(node) ? node : undefined;
      if (type !== undefined) {
        fixes.push({
          rule: 'readonly-types',
          file,
          at,
          needs: 'Mut',
          edits: [
            { start: type.getStart(sourceFile), end: type.getStart(sourceFile), text: 'Mut<' },
            { start: type.getEnd(), end: type.getEnd(), text: '>' },
          ],
        });
        return;
      }
    }
    api.forEachChild(node, visit);
  };
  visit(sourceFile);
  return fixes;
}

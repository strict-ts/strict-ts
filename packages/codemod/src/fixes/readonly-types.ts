// The fixes of the rule readonly-types: `readonly` in front of arrays and properties, the read-only names of Map,
// Set and Array, Readonly<…> around a Record. What sits under Mut<…> has asked for mutation and is left alone.
import { mut, type Mut } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import type { Fix } from '../fix.js';

const RULE = 'readonly-types';
const RENAMED: Readonly<Record<string, string>> = { Array: 'ReadonlyArray', Map: 'ReadonlyMap', Set: 'ReadonlySet' };

export function readonlyFixes(api: typeof ts, sourceFile: ts.SourceFile, file: string): readonly Fix[] {
  const fixes: Mut<Fix[]> = mut([]);
  const named = (node: ts.Node | undefined, name: string): boolean =>
    node !== undefined && api.isTypeReferenceNode(node) && api.isIdentifier(node.typeName) && node.typeName.text === name;
  const start = (node: ts.Node): number => node.getStart(sourceFile);
  const add = (node: ts.Node, ...edits: Fix['edits']): void => {
    fixes.push({ rule: RULE, file, at: start(node), edits });
  };

  const visit = (node: ts.Node, underMut: boolean): void => {
    const asks = underMut || named(node, 'Mut');
    if (!asks) {
      if (api.isArrayTypeNode(node) || api.isTupleTypeNode(node)) {
        const owner = node.parent;
        const isReadonly = api.isTypeOperatorNode(owner) && owner.operator === api.SyntaxKind.ReadonlyKeyword;
        if (!isReadonly) {
          // As the element of another array, `readonly T[]` needs parentheses: `(readonly T[])[]`.
          const nested = api.isArrayTypeNode(owner) && owner.elementType === node;
          add(
            node,
            { start: start(node), end: start(node), text: nested ? '(readonly ' : 'readonly ' },
            ...(nested ? [{ start: node.getEnd(), end: node.getEnd(), text: ')' }] : []),
          );
        }
      } else if (api.isTypeReferenceNode(node) && api.isIdentifier(node.typeName)) {
        const name = node.typeName.text;
        const renamed = RENAMED[name];
        if (renamed !== undefined) {
          add(node, { start: start(node.typeName), end: node.typeName.getEnd(), text: renamed });
        } else if (name === 'Record' && !named(node.parent, 'Readonly')) {
          add(node, { start: start(node), end: start(node), text: 'Readonly<' }, { start: node.getEnd(), end: node.getEnd(), text: '>' });
        }
      } else if (
        api.isPropertySignature(node) ||
        api.isPropertyDeclaration(node) ||
        api.isIndexSignatureDeclaration(node) ||
        (api.isParameter(node) && api.isParameterPropertyDeclaration(node, node.parent))
      ) {
        const modifiers = api.canHaveModifiers(node) ? (api.getModifiers(node) ?? []) : [];
        const isReadonly = modifiers.some((modifier) => modifier.kind === api.SyntaxKind.ReadonlyKeyword);
        const definite = api.isPropertyDeclaration(node) && node.exclamationToken !== undefined;
        if (!isReadonly && !named(node.type, 'Mut') && !definite) {
          // After the other modifiers, in front of the name (or of the bracket of an index signature).
          const place = api.isIndexSignatureDeclaration(node) ? (node.parameters[0]?.getStart(sourceFile) ?? start(node)) - 1 : start(node.name);
          add(node, { start: place, end: place, text: 'readonly ' });
        }
      }
    }
    api.forEachChild(node, (child) => visit(child, asks));
  };
  visit(sourceFile, false);
  return fixes;
}

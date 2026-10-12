// The fixes of the rule no-null: `undefined` in place of `null`, as a value and as a type. Unlike the other fixes
// it changes what the program does, so it is only kept where nothing can tell the two apart: see crossing.ts.
import type { Mut } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import type { Fix } from '../fix.js';

const RULE = 'no-null';

/** Whether a type admits `undefined` as one of its values, by itself. */
const admitsUndefined = (api: typeof ts, type: ts.Type): boolean =>
  (type.isUnion() ? type.types : [type]).some((member) => (member.flags & (api.TypeFlags.Undefined | api.TypeFlags.Void)) !== 0);

/**
 * One fix for each `null` the rule refuses. A `null` is left where `undefined` already means something else at the
 * same place: a union that holds both, an optional property or parameter, a parameter with a default. There the
 * two are two states, and the fix would make them one.
 */
export function nullFixes(api: typeof ts, checker: ts.TypeChecker, sourceFile: ts.SourceFile, file: string): readonly Fix[] {
  const fixes: Mut<Fix[]> = [];
  const isNull = (node: ts.Node | undefined): boolean => node !== undefined && node.kind === api.SyntaxKind.NullKeyword;
  const add = (node: ts.Node): void => {
    const start = node.getStart(sourceFile);
    fixes.push({ rule: RULE, file, at: start, edits: [{ start, end: node.getEnd(), text: 'undefined' }] });
  };
  /** Whether the place a written type belongs to already takes `undefined` for another reason. */
  const alreadyTakesUndefined = (written: ts.TypeNode): boolean => {
    let whole: ts.Node = written;
    while (api.isUnionTypeNode(whole.parent) || api.isParenthesizedTypeNode(whole.parent)) whole = whole.parent;
    if (api.isTypeNode(whole) && admitsUndefined(api, checker.getTypeFromTypeNode(whole))) return true;
    const owner = whole.parent;
    if (api.isPropertySignature(owner) || api.isPropertyDeclaration(owner)) return owner.questionToken !== undefined;
    if (api.isParameter(owner)) return owner.questionToken !== undefined || (owner.initializer !== undefined && !isNull(owner.initializer));
    return false;
  };
  const visit = (node: ts.Node): void => {
    if (api.isLiteralTypeNode(node) && isNull(node.literal)) {
      if (!alreadyTakesUndefined(node)) add(node);
      return;
    }
    if (isNull(node) && api.isExpression(node)) {
      const owner = node.parent;
      const compared =
        api.isBinaryExpression(owner) &&
        [api.SyntaxKind.EqualsEqualsEqualsToken, api.SyntaxKind.ExclamationEqualsEqualsToken, api.SyntaxKind.EqualsEqualsToken, api.SyntaxKind.ExclamationEqualsToken].includes(owner.operatorToken.kind);
      // A comparison is not refused. It is rewritten at the end, where what it compares became `undefined`.
      if (compared) return;
      const expected = checker.getContextualType(node);
      if (expected === undefined || !admitsUndefined(api, expected)) add(node);
      return;
    }
    api.forEachChild(node, visit);
  };
  visit(sourceFile);
  return fixes;
}

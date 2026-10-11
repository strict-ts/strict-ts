// Which fixes a compiler error points at: the declarations its place reads, followed to where a fix wrote. A hint
// for the search and never a verdict: what is kept is compiled again.
import type ts from '@typescript/typescript6';
import type { Fix, Placed } from './fix.js';

/** How far a declaration with no written type is followed into what it is made from. */
const DEPTH = 4;
/** How far the search widens around an error that points at nothing. */
const WIDENING = 4;
/**
 * « Cannot assign to 'x' because it is a read-only property », and the same for `delete`: the property is named,
 * and the fix that made it read-only is the one.
 */
const READ_ONLY_PROPERTY: readonly number[] = [2540, 2704];

/**
 * The fixes an error points at, among those applied. `placedIn` gives the fixes of a file with their places in the
 * text as fixed, which is the text the diagnostic was computed on.
 */
export function blamedFixes(
  api: typeof ts,
  checker: ts.TypeChecker,
  diagnostic: ts.Diagnostic,
  placedIn: (fileName: string) => readonly Placed[],
): readonly Fix[] {
  const file = diagnostic.file;
  const from = diagnostic.start;
  if (file === undefined || from === undefined) return [];
  const to = from + (diagnostic.length ?? 0);

  const found = new Set<Fix>();
  const seen = new Set<ts.Node>();
  const take = (sourceFile: ts.SourceFile, start: number, end: number): void => {
    for (const placed of placedIn(sourceFile.fileName)) if (start <= placed.at && placed.at <= end) found.add(placed.fix);
  };
  const declarationsOf = (name: ts.Node): readonly ts.Declaration[] => {
    // In `{ name }`, the value is what the name stands for.
    const symbol = api.isShorthandPropertyAssignment(name.parent)
      ? checker.getShorthandAssignmentValueSymbol(name.parent)
      : checker.getSymbolAtLocation(name);
    if (symbol === undefined) return [];
    const target = (symbol.flags & api.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
    return target.declarations ?? [];
  };

  /**
   * The fixes of a written type: those at the start of one of its parts, and those of the aliases it names. The
   * members of an object type are left out: they answer when they are named themselves.
   */
  const ofTypes = (node: ts.Node, depth: number): void => {
    if (api.isTypeLiteralNode(node)) return;
    const sourceFile = node.getSourceFile();
    take(sourceFile, node.getStart(sourceFile), node.getStart(sourceFile));
    if (api.isTypeReferenceNode(node)) {
      for (const declaration of declarationsOf(node.typeName)) if (api.isTypeAliasDeclaration(declaration)) ofDeclaration(declaration, depth + 1);
    }
    // `Data['items']` is the type of that member.
    if (api.isIndexedAccessTypeNode(node)) {
      const key = checker.getTypeFromTypeNode(node.indexType);
      const member = key.isStringLiteral() ? checker.getPropertyOfType(checker.getTypeFromTypeNode(node.objectType), key.value) : undefined;
      for (const declaration of member?.declarations ?? []) ofDeclaration(declaration, depth + 1);
    }
    api.forEachChild(node, (child) => ofTypes(child, depth));
  };
  const ofExpression = (node: ts.Node, depth: number): void => {
    if (api.isIdentifier(node)) {
      for (const declaration of declarationsOf(node)) ofDeclaration(declaration, depth);
    } else if (api.isFunctionLike(node)) {
      ofDeclaration(node, depth);
    } else if (api.isTypeNode(node)) {
      // A type written in an expression, as in `[] as T[]`.
      ofTypes(node, depth);
    } else {
      api.forEachChild(node, (child) => ofExpression(child, depth));
    }
  };
  /** What a declaration with no written type takes its type from. */
  const madeFrom = (declaration: ts.Declaration): ts.Node | undefined => {
    if (api.isVariableDeclaration(declaration)) {
      if (declaration.initializer !== undefined) return declaration.initializer;
      const loop = declaration.parent.parent;
      return api.isForOfStatement(loop) || api.isForInStatement(loop) ? loop.expression : undefined;
    }
    if (api.isPropertyDeclaration(declaration) || api.isPropertyAssignment(declaration)) return declaration.initializer;
    // The parameter of a callback is typed by what the callback is given to.
    if (api.isParameter(declaration)) {
      const call = declaration.parent.parent;
      return api.isCallExpression(call) ? call.expression : declaration.initializer;
    }
    return undefined;
  };
  const ofDeclaration = (declaration: ts.Declaration, depth: number): void => {
    if (seen.has(declaration) || depth > DEPTH) return;
    seen.add(declaration);
    const sourceFile = declaration.getSourceFile();
    if (api.isBindingElement(declaration)) {
      ofDeclaration(api.walkUpBindingElementsAndPatterns(declaration), depth);
    } else if (api.isFunctionLike(declaration)) {
      // What a function gives is its return type: a predicate that was removed stood between the parameters and
      // the body, and with no written type, what is returned is read in the body.
      const body = 'body' in declaration ? declaration.body : undefined;
      take(sourceFile, declaration.parameters.end, body?.getStart(sourceFile) ?? declaration.getEnd());
      if (declaration.type !== undefined) ofTypes(declaration.type, depth);
      else if (body !== undefined) ofExpression(body, depth + 1);
    } else {
      const written =
        api.isVariableDeclaration(declaration) ||
        api.isParameter(declaration) ||
        api.isPropertyDeclaration(declaration) ||
        api.isPropertySignature(declaration) ||
        api.isTypeAliasDeclaration(declaration)
          ? declaration.type
          : undefined;
      if (written === undefined) {
        // With no written type, `readonly` in front of the name changes the type that is inferred.
        take(sourceFile, declaration.getStart(sourceFile), declaration.getStart(sourceFile));
        const source = madeFrom(declaration);
        if (source !== undefined) ofExpression(source, depth + 1);
      } else {
        ofTypes(written, depth);
      }
    }
  };

  /**
   * The properties that `object[key]` may name, when the key is one text or a union of them. The compiler reports
   * each of them apart and quotes its name: when the message quotes some, those only are meant.
   */
  const indexed = (node: ts.Node): readonly ts.Declaration[] => {
    const access = api.isElementAccessExpression(node) ? node : node.parent;
    if (!api.isElementAccessExpression(access)) return [];
    const key = checker.getTypeAtLocation(access.argumentExpression);
    const object = checker.getTypeAtLocation(access.expression);
    const names = (key.isUnion() ? key.types : [key]).flatMap((type) => (type.isStringLiteral() ? [type.value] : []));
    const message = api.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    const quoted = names.filter((name) => message.includes(`'${name}'`));
    return (quoted.length > 0 ? quoted : names).flatMap((name) => checker.getPropertyOfType(object, name)?.declarations ?? []);
  };

  const innermost = (node: ts.Node): ts.Node => {
    const inner = api.forEachChild(node, (child) => (child.getStart(file) <= from && to <= child.getEnd() ? child : undefined));
    return inner === undefined ? node : innermost(inner);
  };
  const place = innermost(file);
  if (api.isSourceFile(place)) return [];
  if (READ_ONLY_PROPERTY.includes(diagnostic.code)) {
    // In `object[key]` the error may sit on the key, which is not what is written to.
    const isKey = api.isElementAccessExpression(place.parent) && place.parent.argumentExpression === place;
    const written = isKey || api.isElementAccessExpression(place) ? [] : declarationsOf(api.isPropertyAccessExpression(place) ? place.name : place);
    for (const declaration of [...written, ...indexed(place)]) {
      const sourceFile = declaration.getSourceFile();
      take(sourceFile, declaration.getStart(sourceFile), declaration.getStart(sourceFile));
    }
    if (found.size > 0) return [...found];
  }
  // `list.push` is reported on `push`, and `list[i]` may be reported on `i`: what matters is what is read from.
  const owner = place.parent;
  const named =
    api.isPropertyAccessExpression(owner) && owner.name === place
      ? owner
      : api.isElementAccessExpression(owner) && owner.argumentExpression === place
        ? owner.expression
        : api.isElementAccessExpression(place)
          ? place.expression
          : place;
  const widen = (node: ts.Node, steps: number): void => {
    ofExpression(node, 0);
    const stop = found.size > 0 || steps === 0 || api.isSourceFile(node) || api.isBlock(node) || api.isFunctionLike(node);
    if (!stop) widen(node.parent, steps - 1);
  };
  widen(named, WIDENING);
  return [...found];
}

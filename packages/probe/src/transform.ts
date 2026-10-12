// The compile-time half: a TypeScript transformer that puts probes where strict-ts takes something on trust.
// It changes no behaviour: a probe hands back the value it was given, and throws again what it caught.
import { type Callee, type Config, isUnsafe } from '@strict-ts/core';
import { type Mut, record } from '@strict-ts/std';
import type ts from '@typescript/typescript6';
import type { Shape, Site } from './events.js';

export interface Probes {
  /** Calls to code declared outside the project: does it throw? */
  readonly calls: boolean;
  /** Functions exported by an unsafe directory: does an exception leave them? */
  readonly boundaries: boolean;
  /** Casts: does the value have the shape of its type? */
  readonly casts: boolean;
  /** Values declared read-only where they are made: frozen. */
  readonly freeze: boolean;
}

export const allProbes: Probes = { calls: true, boundaries: true, casts: true, freeze: true };

export interface Instrumented {
  readonly transformer: ts.TransformerFactory<ts.SourceFile>;
  /** The sites of the file, in the order of their index: read after the transformation ran. */
  readonly sites: () => readonly Site[];
}

/** The name the probes are reached by in an instrumented module. */
export const PROBE = '__strictTsProbe$';

const MAX_DEPTH = 4;

/**
 * Builds the transformer for one file. `relative` is the file's path in the project; `calleeOf` says where the
 * function a call reaches is declared, as the rules are told.
 */
export function instrument(
  api: typeof ts,
  checker: ts.TypeChecker,
  relative: string,
  config: Config,
  calleeOf: (call: ts.CallExpression | ts.NewExpression) => Callee | undefined,
  probes: Probes = allProbes,
): Instrumented {
  const sites: Mut<Site[]> = [];
  const unsafe = isUnsafe(relative, config);
  const isTrusted = (name: string | undefined): boolean =>
    name !== undefined && config.allowedImports.some((allowed) => name === allowed || name.startsWith(`${allowed}/`));

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => (sourceFile) => {
    const f = context.factory;
    const place = (node: ts.Node): { readonly line: number; readonly column: number } => {
      const { line, character } = api.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
      return { line: line + 1, column: character + 1 };
    };
    const add = (site: Site): ts.Expression => {
      sites.push(site);
      // `first + n`: the module declares its sites when it loads, and is told the index of its first one.
      return f.createBinaryExpression(f.createIdentifier(`${PROBE}first`), api.SyntaxKind.PlusToken, f.createNumericLiteral(sites.length - 1));
    };
    const probe = (method: string, ...argumentsList: readonly ts.Expression[]): ts.Expression =>
      f.createCallExpression(f.createPropertyAccessExpression(f.createIdentifier(PROBE), method), undefined, argumentsList);

    const literal = (value: unknown): ts.Expression => {
      if (typeof value === 'string') return f.createStringLiteral(value);
      if (typeof value === 'number') return value < 0 ? f.createPrefixUnaryExpression(api.SyntaxKind.MinusToken, f.createNumericLiteral(-value)) : f.createNumericLiteral(value);
      if (typeof value === 'boolean') return value ? f.createTrue() : f.createFalse();
      if (Array.isArray(value)) return f.createArrayLiteralExpression(value.map(literal));
      if (typeof value === 'object' && value !== null) {
        return f.createObjectLiteralExpression(
          Object.entries(value).map(([key, inner]) => f.createPropertyAssignment(f.createStringLiteral(key), literal(inner))),
        );
      }
      return f.createIdentifier('undefined');
    };

    const shapeOf = (type: ts.Type, depth: number): Shape => {
      const flags = type.flags;
      if (depth > MAX_DEPTH || (flags & (api.TypeFlags.Any | api.TypeFlags.Unknown | api.TypeFlags.TypeParameter | api.TypeFlags.Never)) !== 0) return { k: 'unknown' };
      if (type.isStringLiteral() || type.isNumberLiteral()) return { k: 'literal', v: type.value };
      if ((flags & api.TypeFlags.BooleanLiteral) !== 0) return { k: 'literal', v: checker.typeToString(type) === 'true' };
      if ((flags & api.TypeFlags.StringLike) !== 0) return { k: 'string' };
      if ((flags & api.TypeFlags.NumberLike) !== 0) return { k: 'number' };
      if ((flags & api.TypeFlags.BooleanLike) !== 0) return { k: 'boolean' };
      if ((flags & api.TypeFlags.BigIntLike) !== 0) return { k: 'bigint' };
      if ((flags & api.TypeFlags.Undefined) !== 0 || (flags & api.TypeFlags.Void) !== 0) return { k: 'undefined' };
      if ((flags & api.TypeFlags.Null) !== 0) return { k: 'null' };
      if (type.isUnion()) return { k: 'union', of: type.types.map((member) => shapeOf(member, depth + 1)) };
      if (checker.isArrayType(type) || checker.isTupleType(type)) {
        const item = checker.isTupleType(type) ? undefined : checker.getIndexTypeOfType(type, api.IndexKind.Number);
        return { k: 'array', of: item === undefined ? { k: 'unknown' } : shapeOf(item, depth + 1) };
      }
      // A function, a class, or a type from a library (Date, Map…): only that it is an object is checked.
      if ((flags & api.TypeFlags.Object) === 0 || type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) return { k: 'unknown' };
      const declaredInLibrary = (type.getSymbol()?.getDeclarations() ?? []).some((declaration) => declaration.getSourceFile().isDeclarationFile);
      if (declaredInLibrary) return { k: 'object', props: {} };
      const props = record(
        type.getProperties().flatMap((property) => {
          const name = property.getName();
          // A property keyed by a symbol (a brand) has no name a value can be asked for.
          if (name.startsWith('__@')) return [];
          const optional = (property.flags & api.SymbolFlags.Optional) !== 0;
          return [[name, { shape: shapeOf(checker.getTypeOfSymbol(property), depth + 1), optional }] as const];
        }),
      );
      return { k: 'object', props };
    };

    const isReadonlyWritten = (type: ts.TypeNode | undefined): boolean =>
      type !== undefined &&
      ((api.isTypeOperatorNode(type) && type.operator === api.SyntaxKind.ReadonlyKeyword) ||
        (api.isTypeReferenceNode(type) && api.isIdentifier(type.typeName) && ['Readonly', 'ReadonlyArray'].includes(type.typeName.text)));

    const isExported = (node: ts.Node): boolean =>
      api.canHaveModifiers(node) && (api.getModifiers(node) ?? []).some((modifier) => modifier.kind === api.SyntaxKind.ExportKeyword);

    /** `{ try { body } catch (e) { probe.escaped(site, e); throw e; } }` */
    const guarded = (body: ts.ConciseBody, name: string, at: ts.Node): ts.Block => {
      const block = api.isBlock(body) ? body : f.createBlock([f.createReturnStatement(body)], true);
      const caught = f.createIdentifier(`${PROBE}error`);
      const index = add({ line: place(at).line, column: place(at).column, kind: 'boundary', file: relative, name });
      return f.createBlock(
        [
          f.createTryStatement(
            block,
            f.createCatchClause(
              f.createVariableDeclaration(caught),
              f.createBlock([f.createExpressionStatement(probe('escaped', index, caught)), f.createThrowStatement(caught)], true),
            ),
            undefined,
          ),
        ],
        true,
      );
    };

    const visit = (node: ts.Node): ts.Node => {
      // Boundary probes go on the function as written, before its body is visited.
      if (probes.boundaries && unsafe) {
        if (api.isFunctionDeclaration(node) && node.body !== undefined && isExported(node) && node.asteriskToken === undefined) {
          const body = guarded(api.visitEachChild(node.body, visit, context), node.name?.text ?? 'default', node);
          return f.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, body);
        }
        if (api.isVariableStatement(node) && isExported(node)) {
          const declarations = node.declarationList.declarations.map((declaration) => {
            const made = declaration.initializer;
            if (made === undefined || !api.isIdentifier(declaration.name) || !(api.isArrowFunction(made) || api.isFunctionExpression(made))) {
              return api.visitEachChild(declaration, visit, context);
            }
            if (api.isFunctionExpression(made) && made.asteriskToken !== undefined) return api.visitEachChild(declaration, visit, context);
            const body = guarded(api.visitNode(made.body, visit, api.isConciseBody) ?? made.body, declaration.name.text, declaration);
            const wrapped = api.isArrowFunction(made)
              ? f.updateArrowFunction(made, made.modifiers, made.typeParameters, made.parameters, made.type, made.equalsGreaterThanToken, body)
              : f.updateFunctionExpression(made, made.modifiers, made.asteriskToken, made.name, made.typeParameters, made.parameters, made.type, body);
            return f.updateVariableDeclaration(declaration, declaration.name, declaration.exclamationToken, declaration.type, wrapped);
          });
          return f.updateVariableStatement(node, node.modifiers, f.updateVariableDeclarationList(node.declarationList, declarations));
        }
      }

      const visited = api.visitEachChild(node, visit, context);

      if (probes.calls && (api.isCallExpression(visited) || api.isNewExpression(visited)) && (api.isCallExpression(node) || api.isNewExpression(node))) {
        const reached = visited.expression;
        // Left as they are: `super(…)` and `import(…)`, which are not calls of a value; a call in an optional chain;
        // a private method, which cannot be reached by its name; and `eval`, whose direct form reads the local scope.
        const special =
          reached.kind === api.SyntaxKind.SuperKeyword ||
          reached.kind === api.SyntaxKind.ImportKeyword ||
          (node.flags & api.NodeFlags.OptionalChain) !== 0 ||
          (api.isPropertyAccessExpression(reached) && (api.isPrivateIdentifier(reached.name) || reached.expression.kind === api.SyntaxKind.SuperKeyword)) ||
          (api.isIdentifier(reached) && reached.text === 'eval');
        const callee = special ? undefined : calleeOf(node);
        // As the rule reads it: a package is allowed for what it exports, wherever it keeps it.
        const trusted = callee !== undefined && callee.origin.kind === 'package' && (isTrusted(callee.origin.package) || isTrusted(callee.importedFrom));
        const outside = callee !== undefined && callee.origin.kind !== 'project' && !trusted;
        if (callee !== undefined && outside) {
          const index = add({
            line: place(node).line, column: place(node).column,
            kind: 'call',
            file: relative,
            name: callee.name,
            origin: callee.origin.kind === 'library' ? 'library' : 'package',
            ...(callee.origin.kind === 'package' && callee.origin.package !== undefined ? { package: callee.origin.package } : {}),
            argumentCount: node.arguments?.length ?? 0,
          });
          // The receiver and the arguments are computed first, in order, outside what the probe catches: an exception
          // seen by the probe is the call's own.
          const given = f.createArrayLiteralExpression(visited.arguments ?? []);
          if (api.isNewExpression(visited)) return probe('make', index, reached, given);
          if (api.isPropertyAccessExpression(reached)) return probe('method', index, reached.expression, f.createStringLiteral(reached.name.text), given);
          if (api.isElementAccessExpression(reached)) return probe('method', index, reached.expression, reached.argumentExpression, given);
          return probe('fn', index, reached, given);
        }
      }

      if (probes.casts && (api.isAsExpression(visited) || api.isTypeAssertionExpression(visited)) && (api.isAsExpression(node) || api.isTypeAssertionExpression(node))) {
        const written = node.type;
        const isConst = api.isTypeReferenceNode(written) && api.isIdentifier(written.typeName) && written.typeName.text === 'const';
        const shape: Shape = isConst ? { k: 'unknown' } : shapeOf(checker.getTypeFromTypeNode(written), 0);
        if (shape.k !== 'unknown') {
          const index = add({ line: place(node).line, column: place(node).column, kind: 'cast', file: relative, name: checker.typeToString(checker.getTypeFromTypeNode(written)).slice(0, 80) });
          const checked = probe('cast', index, visited.expression, literal(shape));
          return api.isAsExpression(visited) ? f.updateAsExpression(visited, checked, visited.type) : f.updateTypeAssertion(visited, visited.type, checked);
        }
      }

      if (probes.freeze && api.isVariableDeclaration(visited) && api.isVariableDeclaration(node) && visited.initializer !== undefined && isReadonlyWritten(node.type)) {
        return f.updateVariableDeclaration(visited, visited.name, visited.exclamationToken, visited.type, probe('frozen', visited.initializer));
      }
      return visited;
    };

    return api.visitEachChild(sourceFile, visit, context);
  };

  return { transformer, sites: () => sites };
}

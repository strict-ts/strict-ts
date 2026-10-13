// From the types a file exports to the schemas that check them at run time. The author writes types and nothing
// else; each generated schema is annotated `Schema<TheType>`, so the compiler itself refuses a schema that does not
// produce the type. Read on the syntax alone: no program is compiled to generate.
import { err, mut, type Mut, ok, type Result, toJson } from '@strict-ts/std';
import type ts from '@typescript/typescript6';

/** A type the generator cannot follow, with its place: nothing is generated for the file then. */
export interface Unfollowed {
  readonly line: number;
  readonly column: number;
  readonly what: string;
}

export interface Derived {
  /** The text of the generated module. */
  readonly text: string;
  /** The types a schema was generated for, in the order of the file. */
  readonly types: readonly string[];
}

/** The checks a brand of the standard library stands for: `Branded<number, 'Positive'>` is `s.positive(…)`. */
const CHECKS: Readonly<Record<string, string>> = { Positive: 's.positive', Integer: 's.integer', NonEmpty: 's.nonEmpty' };

/** A text as it is written in code, in double quotes. */
const quote = (text: string): string => toJson(text).unwrapOr('""');

/** `Invoice` gives `InvoiceSchema`: a type and a value of the same name cannot both be imported. */
export const schemaName = (type: string): string => `${type}Schema`;

/**
 * Generates the schemas of `names`, or of every type the file exports when none is named. `from` is how the
 * generated module imports the file (`./invoice.js`).
 */
export function deriveSchemas(api: typeof ts, sourceFile: ts.SourceFile, from: string, names: readonly string[]): Result<Derived, readonly Unfollowed[]> {
  const problems: Mut<Unfollowed[]> = mut([]);
  const unfollowed = (node: ts.Node, what: string): string => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    problems.push({ line: line + 1, column: character + 1, what });
    return 's.string';
  };

  type Declared = ts.TypeAliasDeclaration | ts.InterfaceDeclaration;
  const declared = new Map<string, Declared>();
  for (const statement of sourceFile.statements) {
    if (api.isTypeAliasDeclaration(statement) || api.isInterfaceDeclaration(statement)) declared.set(statement.name.text, statement);
  }
  const isExported = (declaration: Declared): boolean => (api.getCombinedModifierFlags(declaration) & api.ModifierFlags.Export) !== 0;

  // The schemas in the order they must be written: one that another names comes first.
  const written: Mut<string[]> = mut([]);
  const done = new Set<string>();
  const inProgress = new Set<string>();

  const literalOf = (node: ts.TypeNode): string | undefined => {
    if (!api.isLiteralTypeNode(node)) return undefined;
    const literal = node.literal;
    if (api.isStringLiteral(literal)) return quote(literal.text);
    if (api.isNumericLiteral(literal)) return literal.text;
    if (literal.kind === api.SyntaxKind.TrueKeyword) return 'true';
    if (literal.kind === api.SyntaxKind.FalseKeyword) return 'false';
    return undefined;
  };

  const objectOf = (members: readonly ts.TypeElement[], indent: string): string => {
    const inner = `${indent}  `;
    const lines = members.map((member) => {
      if (!api.isPropertySignature(member) || member.type === undefined) return `${inner}// ${unfollowed(member, 'a member that is not a property with a type (a method, an index signature)')}`;
      if (!api.isIdentifier(member.name) && !api.isStringLiteral(member.name)) return `${inner}// ${unfollowed(member.name, 'a property whose name is computed')}`;
      const key = api.isIdentifier(member.name) ? member.name.text : quote(member.name.text);
      const value = schemaOf(member.type, inner);
      return `${inner}${key}: ${member.questionToken === undefined ? value : `s.optional(${value})`},`;
    });
    return `s.object({\n${lines.join('\n')}\n${indent}})`;
  };

  const schemaOf = (node: ts.TypeNode, indent: string): string => {
    if (api.isParenthesizedTypeNode(node)) return schemaOf(node.type, indent);
    if (node.kind === api.SyntaxKind.StringKeyword) return 's.string';
    if (node.kind === api.SyntaxKind.NumberKeyword) return 's.number';
    if (node.kind === api.SyntaxKind.BooleanKeyword) return 's.boolean';
    const literal = literalOf(node);
    if (literal !== undefined) return `s.literal(${literal})`;
    if (node.kind === api.SyntaxKind.UnknownKeyword) return 's.unknown';
    if (api.isUnionTypeNode(node)) {
      // `| undefined` is a value that may be missing; the literals are one schema; what is left is a choice.
      const isUndefined = (member: ts.TypeNode): boolean => member.kind === api.SyntaxKind.UndefinedKeyword;
      const present = node.types.filter((member) => !isUndefined(member));
      const literals = present.flatMap((member) => literalOf(member) ?? []);
      const shapes = present.filter((member) => literalOf(member) === undefined).map((member) => schemaOf(member, indent));
      const members = [...(literals.length === 0 ? [] : [`s.literal(${literals.join(', ')})`]), ...shapes];
      const [only] = members;
      if (only === undefined) return unfollowed(node, 'a union of `undefined` alone');
      const choice = members.length === 1 ? only : `s.union(${members.join(', ')})`;
      return present.length === node.types.length ? choice : `s.nullish(${choice})`;
    }
    if (api.isLiteralTypeNode(node) && node.literal.kind === api.SyntaxKind.NullKeyword) {
      return unfollowed(node, '`null`: write `| undefined`, which is read from a `null` as well');
    }
    if (api.isTypeOperatorNode(node) && node.operator === api.SyntaxKind.ReadonlyKeyword && api.isArrayTypeNode(node.type)) {
      return `s.array(${schemaOf(node.type.elementType, indent)})`;
    }
    if (api.isArrayTypeNode(node)) return unfollowed(node, 'a mutable array: a parsed value is read-only, write `readonly T[]`');
    if (api.isTypeLiteralNode(node)) return objectOf(node.members, indent);
    if (api.isTypeReferenceNode(node)) {
      // `s.Branded` is `Branded`: the library is imported under a name.
      const name = api.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.right.text;
      const [first, second] = node.typeArguments ?? [];
      if (name === 'ReadonlyArray' && first !== undefined) return `s.array(${schemaOf(first, indent)})`;
      if (name === 'Array') return unfollowed(node, 'a mutable array: a parsed value is read-only, write `ReadonlyArray<T>`');
      if (name === 'Readonly' && first !== undefined) return schemaOf(first, indent);
      if (name === 'Record' && first !== undefined && second !== undefined) {
        return first.kind === api.SyntaxKind.StringKeyword ? `s.record(${schemaOf(second, indent)})` : unfollowed(first, 'a record whose keys are not `string`');
      }
      if (name === 'Date' && first === undefined) return 's.date';
      if (name === 'Branded' && first !== undefined && second !== undefined) {
        const brand = api.isLiteralTypeNode(second) && api.isStringLiteral(second.literal) ? second.literal.text : undefined;
        if (brand === undefined) return unfollowed(second, 'a brand that is not one name');
        const check = CHECKS[brand];
        // A brand of the library is its check. One of the author's is a name: nothing says what to test.
        return check === undefined ? `s.branded(${schemaOf(first, indent)}, ${quote(brand)})` : `${check}(${schemaOf(first, indent)})`;
      }
      const local = declared.get(name);
      if (local !== undefined && first === undefined) return named(local, node);
      return unfollowed(node, `the type \`${name}\`: it is not declared in this file, or it takes arguments`);
    }
    return unfollowed(node, 'a type the standard library has no schema for');
  };

  /** The name of the schema of a type of the file, written before whoever names it. */
  const named = (declaration: Declared, at: ts.Node): string => {
    const name = declaration.name.text;
    if (inProgress.has(name)) return unfollowed(at, `the type \`${name}\`, which contains itself`);
    if (!done.has(name)) {
      if (!isExported(declaration)) return unfollowed(declaration.name, `the type \`${name}\` is not exported: the generated module cannot name it`);
      if (declaration.typeParameters !== undefined) return unfollowed(declaration.name, `the type \`${name}\` takes parameters`);
      if (api.isInterfaceDeclaration(declaration) && declaration.heritageClauses !== undefined) return unfollowed(declaration.name, `the interface \`${name}\` extends another`);
      inProgress.add(name);
      const body = api.isInterfaceDeclaration(declaration) ? objectOf(declaration.members, '') : schemaOf(declaration.type, '');
      inProgress.delete(name);
      done.add(name);
      written.push(`export const ${schemaName(name)}: s.Schema<${name}> = ${body};`);
    }
    return schemaName(name);
  };

  const asked = names.length > 0 ? names : [...declared.values()].filter(isExported).map((declaration) => declaration.name.text);
  for (const name of asked) {
    const declaration = declared.get(name);
    if (declaration === undefined) problems.push({ line: 1, column: 1, what: `the type \`${name}\` is not declared in this file` });
    else named(declaration, declaration.name);
  }
  if (problems.length > 0) return err(problems);

  const types = [...done].toSorted();
  const text = [
    `// Generated by strict-ts-derive from ${from.replace(/^\.\//, '').replace(/\.js$/, '.ts')}. Do not edit: change the types, and generate again.`,
    '// Each schema is annotated with its type: the compiler refuses one that does not produce it.',
    "import { s } from '@strict-ts/std';",
    `import type { ${types.join(', ')} } from ${quote(from)};`,
    '',
    written.join('\n\n'),
    '',
  ].join('\n');
  return ok({ text, types: [...done] });
}

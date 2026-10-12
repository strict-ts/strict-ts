# @strict-ts/derive

A spike. Generates the schema of a type from the type itself, so that nobody writes a schema.

Types are erased when the code runs: to check a value that comes from outside, something must exist at run time. With
`@strict-ts/std` alone, the author writes that something, a schema, and the type is inferred from it. Here it is the
other way round: the author writes the type, as TypeScript is written, and the schema is generated.

```ts
// invoice.ts, written by hand
export type Line = { readonly label: string; readonly quantity: number; readonly unitPrice: number };
export type Invoice = {
  readonly id: string;
  readonly status: "draft" | "sent" | "paid" | "cancelled";
  readonly lines: readonly Line[];
  readonly paidAt?: Date;
};
```

```sh
strict-ts-derive src/invoice.ts            # writes src/invoice.schema.ts
strict-ts-derive src/invoice.ts --check    # in the CI: fails when the file on disk is not what the types give
strict-ts-derive src/invoice.ts Invoice    # only this type, and those it names
```

```ts
// invoice.schema.ts, generated
export const LineSchema: s.Schema<Line> = s.object({ label: s.string, quantity: s.number, unitPrice: s.number });

export const InvoiceSchema: s.Schema<Invoice> = s.object({
  id: s.string,
  status: s.literal("draft", "sent", "paid", "cancelled"),
  lines: s.array(LineSchema),
  paidAt: s.optional(s.date),
});
```

`InvoiceSchema.parse(input)` gives a `Result<Invoice, SchemaError>`, as a schema written by hand does.

## Why it can be trusted

**Each generated schema is annotated with its type**, `s.Schema<Invoice>`. The generator could be wrong, and a type
could change without the schema being generated again: in both cases the schema no longer produces the type, and
the compiler refuses the generated file. No transformer, no step added to the compilation: the generated file is
plain TypeScript, kept in the repo, with no cast in it, and it passes the gate as it is.

The generator reads the syntax of one file. It does not compile the project.

## What it follows

| In the type | In the schema |
|---|---|
| `string`, `number`, `boolean` | `s.string`, `s.number`, `s.boolean` |
| `"a" \| "b"`, `1 \| 2`, `true` | `s.literal(…)` |
| `readonly T[]`, `ReadonlyArray<T>` | `s.array(…)` |
| `{ readonly a: T; readonly b?: U }`, an `interface` | `s.object({ a: …, b: s.optional(…) })` |
| `Readonly<Record<string, T>>` | `s.record(…)` |
| `Circle \| Square`, `string \| number` | `s.union(…)`, which tries each in the order written |
| `T \| undefined` | `s.nullish(…)`, which reads a `null` as `undefined` too |
| `unknown` | `s.unknown` |
| `Date` | `s.date`, which reads an ISO text |
| `Branded<number, 'Positive'>`, `'Integer'`, `'NonEmpty'` | `s.positive(…)`, `s.integer(…)`, `s.nonEmpty(…)` |
| `Branded<string, 'CustomerId'>`, a brand of your own | `s.branded(…, 'CustomerId')`: a name, with no check |
| Another exported type of the same file | its schema, written first |

## What it does not follow

It says so, with the place, and writes nothing:

```
strict-ts-derive: types.ts:1:37 cannot follow a mutable array: a parsed value is read-only, write `readonly T[]`
```

- A type declared in another file. This is the largest gap: a project keeps its types in one place and reads them
  in another.
- A type with parameters, a type that contains itself, an interface that extends another, a tuple, `Partial<…>`, a
  record whose keys are not `string`.
- `null`: the rules refuse it in a type, and `T | undefined` is read from a `null` as well.
- A choice where one shape holds another: `s.union` takes the first that fits, and an object schema drops the keys
  it does not name. The generator writes the shapes in the order of the type and does not look at this.
- A mutable array: a parsed value is read-only.
- A check of your own (`s.refine`, `s.between`): a type says the name of a brand, not what to test. The schema is
  then written by hand, as before; the two can live in the same project.

## Measured

- **The invoice example** ([`examples/invoice/derived`](../../examples/invoice/derived)): 33 lines written by hand,
  against 34 with the schemas written by hand; 18 more are generated. The gain is not in lines: it is that the types
  are types, and that `s.Infer` is gone.
- **The casts of six existing applications** (87,791 lines): 532 casts, 359 of them to a type written in the cast.
  The generator follows 134 of those as they are, and 178, half of them, once the fixer has made their arrays
  read-only. What stops the others: a type the library has no schema for (36: a tuple, a function, `typeof`), a
  mutable array the fixer left (22), `null` (18), and about 60 names of types declared elsewhere in the file or in
  another. 157 more casts are to a bare name and were not looked at.
- **Many of those casts are not a boundary.** `as HTMLElement`, `as Kind`: a value of the program narrowed by hand,
  where a schema is not the answer. So this is a help where data comes in, and not a fix for `no-cast`.

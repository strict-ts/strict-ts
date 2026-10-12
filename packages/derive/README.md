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
| `Date` | `s.date`, which reads an ISO text |
| `Branded<number, 'Positive'>`, `'Integer'`, `'NonEmpty'` | `s.positive(…)`, `s.integer(…)`, `s.nonEmpty(…)` |
| `Branded<string, 'CustomerId'>`, a brand of your own | `s.branded(…, 'CustomerId')`: a name, with no check |
| Another exported type of the same file | its schema, written first |

## What it does not follow

It says so, with the place, and writes nothing:

```
strict-ts-derive: types.ts:1:37 cannot follow a mutable array: a parsed value is read-only, write `readonly T[]`
```

- **A choice between shapes** (`Circle | Square`, `T | undefined`, `T | null`): the standard library has no schema
  for one. This is the largest gap.
- A type declared in another file, a type with parameters, a type that contains itself, an interface that extends
  another, a tuple, `unknown`.
- A mutable array: a parsed value is read-only.
- A check of your own (`s.refine`, `s.between`): a type says the name of a brand, not what to test. The schema is
  then written by hand, as before; the two can live in the same project.

## Measured

- **The invoice example** ([`examples/invoice/derived`](../../examples/invoice/derived)): 33 lines written by hand,
  against 34 with the schemas written by hand; 18 more are generated. The gain is not in lines: it is that the types
  are types, and that `s.Infer` is gone.
- **The casts of six existing applications** (87,791 lines): 532 casts, 359 of them to a type written in the cast.
  The generator follows 104 of those as they are. 107 fail on a mutable array, which the fixer turns read-only; 59
  on a choice between shapes; 53 on a type with no schema (`unknown`, a tuple, `null`). 157 more casts name a type
  declared elsewhere, which was not looked at.

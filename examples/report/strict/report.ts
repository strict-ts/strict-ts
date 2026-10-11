// The same report, conforming: each failure is in a type, and nothing else can throw.
import { quotient, Result, s, textOf } from "@strict-ts/std";
import { fixed, parseJson, pattern, whole } from "./unsafe/system.js";

const Sale = s.object({ product: s.string, cents: s.integer(s.number), tags: s.array(s.string) });
export type Sale = s.Infer<typeof Sale>;

export const readSales = (json: string) => parseJson(json).andThen(s.array(Sale).parse).mapErr(textOf);

export const matching = (sales: readonly Sale[], source: string) =>
  pattern(source).map((wanted) => sales.filter((sale) => wanted.test(sale.product)));

/** `BigInt(1.5)` throws, and so does a division by zero: both are in the type. */
export const average = (sales: readonly Sale[]) =>
  Result.gen(function* () {
    const total = yield* whole(sales.reduce((sum, sale) => sum + sale.cents, 0));
    const count = yield* whole(sales.length);
    return quotient(total, count).okOr("no sale matches");
  });

export const euros = (cents: number) => fixed(cents / 100, 2);

export const line = (sale: Sale) => euros(sale.cents).map((amount) => `${sale.product}: ${amount} [${sale.tags.join(", ")}]`);

export const report = (json: string, source: string) =>
  Result.gen(function* () {
    const sales = yield* matching(yield* readSales(json), source);
    const lines: readonly string[] = yield* all(sales.map(line));
    const mean = yield* average(sales);
    return Result.ok([...lines, `average: ${yield* euros(Number(mean))}`].join("\n"));
  });

/** Every value, or the first error. */
const all = <T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E> =>
  results.reduce<Result<readonly T[], E>>((sum, result) => sum.andThen((values) => result.map((value) => [...values, value])), Result.ok([]));

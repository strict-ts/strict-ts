/**
 * The one of `values` that `given` is, or `undefined`: how a text from outside (a field of a form, a part of a
 * query string) becomes a name the program knows, without a cast.
 *
 *   const KINDS = ['spam', 'promo'] as const;
 *   oneOf(KINDS, form.kind) // 'spam' | 'promo' | undefined
 *
 * Inside a shape read by a schema, `s.literal(...KINDS)` asks the same question and its error says what was expected.
 */
export const oneOf = <const T extends string | number | boolean>(values: readonly T[], given: unknown): T | undefined =>
  values.find((value) => value === given);

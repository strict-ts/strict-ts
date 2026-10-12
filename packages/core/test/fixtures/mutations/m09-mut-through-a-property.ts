// A value typed read-only reaches a Mut type through a property of an object written in place.
import type { Mut } from '@strict-ts/std';
const frozen: { readonly count: number } = { count: 0 };
const holder: { readonly inner: Mut<{ count: number }> } = { inner: frozen };
holder.inner.count = 3;
if (frozen.count !== 0) console.log('BROKEN m09: count is typed readonly and is', frozen.count);

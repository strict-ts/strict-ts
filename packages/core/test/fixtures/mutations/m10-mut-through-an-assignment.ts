// The same through the right side of an assignment.
import type { Mut } from '@strict-ts/std';
const frozen: { readonly count: number } = { count: 0 };
let open: Mut<{ count: number }> = { count: 1 };
open = frozen;
open.count = 3;
if (frozen.count !== 0) console.log('BROKEN m10: count is typed readonly and is', frozen.count);

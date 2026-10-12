// A switch on a value whose test is stale: the compiler takes its cases for all there is, and the function ends
// with no value.
import type { Mut } from '@strict-ts/std';
type Kind = 'a' | 'b' | 'c';
const foe: Mut<{ kind: Kind }> = { kind: 'a' };
const turn = (): void => {
  foe.kind = 'c';
};
function score(): number {
  if (foe.kind === 'c') return 0;
  turn();
  switch (foe.kind) {
    case 'a':
      return 1;
    case 'b':
      return 2;
  }
}
const got: number = score();
if (typeof got !== 'number') console.log('BROKEN c10: got is typed number and is', typeof got);

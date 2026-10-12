// A function written with an arrow in a constructor and kept: it changes the object later, and nothing says so.
import type { Mut } from '@strict-ts/std';
class Counter {
  value: Mut<number> = 0;
  readonly bump: () => void;
  constructor() {
    this.bump = () => {
      this.value += 1;
    };
  }
}
function touch(counter: Counter): void {
  counter.bump();
}
const counter = new Counter();
touch(counter);
if (counter.value !== 0) console.log('BROKEN m26: touch takes no Mut and value is', counter.value);

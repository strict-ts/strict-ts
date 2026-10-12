// A parameter that does not ask for mutation, changed by its own method.
import type { Mut } from '@strict-ts/std';
class Counter {
  value: Mut<number> = 0;
  increment(): void {
    this.value += 1;
  }
}
function touch(counter: Counter): void {
  counter.increment();
}
const counter = new Counter();
touch(counter);
if (counter.value !== 0) console.log('BROKEN m04: touch takes no Mut and value is', counter.value);

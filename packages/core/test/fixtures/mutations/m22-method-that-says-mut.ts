// A method that says it changes its object, called on a parameter that does not ask for mutation.
import type { Mut } from '@strict-ts/std';
class Counter {
  value: Mut<number> = 0;
  increment(this: Mut<Counter>): void {
    this.value += 1;
  }
}
function touch(counter: Counter): void {
  counter.increment();
}
const counter = new Counter();
touch(counter);
if (counter.value !== 0) console.log('BROKEN m22: touch takes no Mut and value is', counter.value);

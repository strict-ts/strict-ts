// A method that says `this: Mut<…>`, bound to an object that was given to read, or applied to it.
import type { Mut } from '@strict-ts/std';
class Counter {
  count: Mut<number> = 0;
  bump(this: Mut<Counter>): void {
    this.count += 1;
  }
}
function a(counter: Counter): void {
  counter.bump.bind(counter)();
}
function b(counter: Counter): void {
  try {
    Reflect.apply(counter.bump, counter, []);
  } catch {
    // Nothing to do.
  }
}
const counter = new Counter();
a(counter);
b(counter);
if (counter.count !== 0) console.log('BROKEN m73: neither takes Mut and count is', counter.count);

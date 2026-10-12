// A method that does not say it changes its object, and changes what its object holds through another method.
import type { Mut } from '@strict-ts/std';
class Counter {
  value: Mut<number> = 0;
  increment(this: Mut<Counter>): void {
    this.value += 1;
  }
}
class Meter {
  readonly counter: Counter = new Counter();
  read(): number {
    this.counter.increment();
    return this.counter.value;
  }
}
const meter = new Meter();
const first = meter.read();
if (meter.read() !== first) console.log('BROKEN m23: read does not say it writes and gave', first, 'then', meter.read() - 1);

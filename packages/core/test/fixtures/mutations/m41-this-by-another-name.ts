// `this` under another name, in a method that does not say `this: Mut<…>`.
import type { Mut } from '@strict-ts/std';
class Counter {
  count: Mut<number> = 0;
  peek(): number {
    // oxlint-disable-next-line typescript/no-this-alias -- the attack
    const self = this;
    self.count += 1;
    return self.count;
  }
}
function read(counter: Counter): number {
  return counter.peek();
}
const counter = new Counter();
read(counter);
if (counter.count !== 0) console.log('BROKEN m41: read takes no Mut and count is', counter.count);

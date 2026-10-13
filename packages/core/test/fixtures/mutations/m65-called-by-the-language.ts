// A method the language calls by itself says `this: Mut<…>`.
import type { Mut } from '@strict-ts/std';
class Bag {
  seen: Mut<number> = 0;
  [Symbol.iterator](this: Mut<Bag>): IterableIterator<number> {
    this.seen += 1;
    return [this.seen].values();
  }
  toString(this: Mut<Bag>): string {
    this.seen += 1;
    return 'bag';
  }
}
function read(bag: Bag): string {
  const all = [...bag];
  return `${bag}${all.length}`;
}
const bag = new Bag();
read(bag);
if (bag.seen !== 0) console.log('BROKEN m65: read takes no Mut and the bag was changed', bag.seen, 'times');

// A function written in a constructor and called at once: it reads a property that has no value yet.
class Total {
  readonly seen: readonly string[];
  readonly unit: string;
  constructor(parts: readonly number[]) {
    this.seen = parts.map(() => typeof this.unit);
    this.unit = 'm';
  }
}
const [first] = new Total([1]).seen;
if (first === 'undefined') console.log('BROKEN c05: this.unit is typed string and is undefined');
export {};

// A method taken off its object loses `this`.
class Meter {
  readonly unit = 'm';
  show(): string {
    return this.unit;
  }
}
const show = new Meter().show;
try {
  show();
} catch {
  console.log('BROKEN a20: a call the types accept throws a TypeError');
}
export {};

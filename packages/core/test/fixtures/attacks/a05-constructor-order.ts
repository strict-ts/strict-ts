// A method called in the constructor reads a property that is not assigned yet.
class Counter {
  readonly seen: string;
  readonly start: number;
  constructor() {
    this.seen = this.read();
    this.start = 1;
  }
  read(): string {
    return typeof this.start;
  }
}
if (new Counter().seen === 'undefined') console.log('BROKEN a05: this.start is typed number and is undefined');
export {};

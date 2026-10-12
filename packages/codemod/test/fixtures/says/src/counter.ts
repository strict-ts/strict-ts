import type { Mut } from '@strict-ts/std';

export class Counter {
  value: Mut<number> = 0;

  increment(): void {
    this.value += 1;
  }

  twice(): void {
    this.increment();
    this.increment();
  }

  add(step: number): void {
    this.value += step;
  }

  get shown(): string {
    this.value += 0;
    return `${this.value}`;
  }
}

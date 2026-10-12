import { Counter } from './counter.js';

const held = new Counter();

export const current = (): Counter => held;

export function touch(counter: Counter): void {
  counter.increment();
}

export function bump(): void {
  const now = current();
  now.twice();
}

export const later = async (): Promise<Counter> => held;

export async function wait(): Promise<void> {
  const now = await later();
  now.add(2);
}

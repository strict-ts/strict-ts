export function share(total: number, people: number): number {
  if (people === 0) throw new Error('nobody to share with');
  return total / people;
}

export function label(total: number, people: number): string {
  // Nothing here says that `share` may throw.
  return `${share(total, people)} each`;
}

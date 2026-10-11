// Safe code that the gate accepts or refuses on what the ledger says; the probes say what really happens.
export const label = (cents: number, digits: number): string => (cents / 100).toFixed(digits);

export const tags = (text: string): readonly string[] => text.trim().split(",");

export const pad = (size: number): ArrayBuffer => new ArrayBuffer(size);

export const joined = (items: readonly symbol[]): string => items.join(",");

export const rates: readonly number[] = [5, 10, 20];

// What leaves the program, or is told apart from `undefined` in it.
export interface Row {
  readonly id: number;
  readonly note: string | null;
}

// As JSON, a `null` is written and an `undefined` is left out.
export const stored = (row: Row): string => JSON.stringify(row);

export interface Label {
  readonly text: string | null;
}

// In a text, one reads « null » and the other « undefined ».
export const shown = (label: Label): string => `label: ${label.text}`;

export interface Choice {
  readonly picked: string | null | undefined;
}

// Two states already: not chosen yet, and chosen to be nothing.
export const chosen = (choice: Choice): string => (choice.picked === undefined ? 'not yet' : choice.picked === null ? 'nothing' : choice.picked);

export const pick = (picked: string | null = 'first'): Choice => ({ picked });

export interface Loose {
  readonly value: number | null;
}

// A parameter that takes anything: what is done with it there is not known.
const sent: unknown[] = [];
const send = (anything: unknown): void => {
  sent.push(anything);
};
export const posted = (loose: Loose): void => send(loose.value);

// From outside, typed by nothing: a `null` may still come in.
export interface Parsed {
  readonly count: number | null;
}
export const parsed = (text: string): Parsed => JSON.parse(text);
export const counted = (given: Parsed): number => (given.count === null ? 0 : given.count);

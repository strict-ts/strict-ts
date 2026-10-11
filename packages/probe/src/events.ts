/** A place in the instrumented code where a probe sits. */
export interface Site {
  readonly kind: 'call' | 'boundary' | 'cast';
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** For a call: the function it reaches, as the effects ledger names it. For a boundary: the exported function. */
  readonly name: string;
  /** For a call: where that function is declared. */
  readonly origin?: 'library' | 'package';
  readonly package?: string;
  /** For a call: how many arguments are written. */
  readonly argumentCount?: number;
}

/** What a probe saw when the code ran. One line of the events file each. */
export type Event =
  /** A call to outside code threw, or returned a promise that rejected. */
  | { readonly type: 'threw'; readonly site: Site; readonly error: string }
  /** An exception left a function exported by an unsafe directory. */
  | { readonly type: 'escaped'; readonly site: Site; readonly error: string }
  /** The value of a cast did not have the shape of its type. */
  | { readonly type: 'miscast'; readonly site: Site; readonly at: string; readonly expected: string; readonly found: string }
  /** How many times each call site ran without throwing, written when the process ends. */
  | { readonly type: 'ran'; readonly site: Site; readonly count: number };

/** The shape of a type, as far as a cast is checked against it. `unknown` accepts everything. */
export type Shape =
  | { readonly k: 'unknown' }
  | { readonly k: 'string' | 'number' | 'boolean' | 'bigint' | 'undefined' | 'null' }
  | { readonly k: 'literal'; readonly v: string | number | boolean }
  | { readonly k: 'array'; readonly of: Shape }
  | { readonly k: 'object'; readonly props: Readonly<Record<string, { readonly shape: Shape; readonly optional: boolean }>> }
  | { readonly k: 'union'; readonly of: readonly Shape[] };

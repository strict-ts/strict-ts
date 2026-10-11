// The effects ledger: what is known of each function declared outside the checked files. The rule no-throwing-call
// reads nothing else. A function that is not in it is not known not to throw, and is refused.
import { hasShape, type Shape } from './shapes.js';

/** What tells that an entry is right. An entry without a specification clause and without runs is a judgement. */
export interface Evidence {
  /** The clause of the ECMAScript specification the verdict was derived from. */
  readonly spec?: string;
  /** How many calls with generated arguments were observed. */
  readonly runs?: number;
  /** A call that was seen to throw, as text. */
  readonly example?: string;
  /** Classified by a person: why. Used where there is no specification to read and nothing to run. */
  readonly byHand?: string;
}

/**
 * The arguments on which a function that may throw does not: one shape for each argument in turn, and `rest` for
 * every one after them. Shown by calls in a browser, `runs` of them, none of which threw.
 */
export interface Written {
  readonly shapes: readonly Shape[];
  readonly rest?: Shape;
  /** What the shapes were written from: the method of the DOM or HTML standard, and what it says throws. */
  readonly clause: string;
  readonly runs: number;
}

export interface Effect {
  /** `total`: does not throw on arguments its types accept. `throws`: may. */
  readonly verdict: 'total' | 'throws';
  /** For `throws`: what happens, as the diagnostic says it. */
  readonly why?: string;
  /** For `throws`: only when called with fewer arguments than this (`reduce` without a starting value). */
  readonly below?: number;
  /** For `throws`: only when called with at least this many arguments (`toString` given a radix). */
  readonly atLeast?: number;
  /**
   * For `throws`: only on a value that cannot be converted to text or to a number: a symbol, an object without a
   * prototype, a cycle. A call whose receiver and arguments are all plain (strings, numbers, booleans, bigints,
   * null, undefined, and arrays of those) is then safe.
   */
  readonly unprintable?: true;
  /**
   * For `throws`: only on a buffer that was detached (handed to another thread, transferred). A project that says
   * it never detaches one (`assume: ["attached-buffers"]`) may make the call.
   */
  readonly detached?: true;
  /**
   * For `total`: only seen not to throw, in runs. Nothing was read that says it cannot. So for the DOM, which has
   * no specification this project reads. The call is refused unless the project takes the runs as enough
   * (`assume: ["dom-as-observed"]`).
   */
  readonly observedOnly?: true;
  /**
   * For `throws`, in the DOM: not on arguments that are written in the call and have these shapes
   * (`classList.add('hidden')`). As everything known of the DOM, this was seen and not read: it counts for a
   * project that takes the runs as enough (`assume: ["dom-as-observed"]`).
   */
  readonly written?: Written;
  readonly evidence: Evidence;
}

export type Ledger = Readonly<Record<string, Effect>>;

/**
 * Whether an entry makes a call a possible exception, and why. `plain` says whether the receiver and the arguments
 * of the call are all plain values, as far as their types tell; `attached`, whether the project says that no buffer
 * is ever detached.
 */
export function threatOf(effect: Effect, argumentCount: number, plain = false, attached = false, observed = false): string | undefined {
  if (effect.verdict === 'total') {
    if (effect.observedOnly !== true || observed) return undefined;
    return `was only seen not to throw (${effect.evidence.runs ?? 0} calls in a browser): nothing was read that says it cannot`;
  }
  if (effect.below !== undefined && argumentCount >= effect.below) return undefined;
  if (effect.atLeast !== undefined && argumentCount < effect.atLeast) return undefined;
  if (effect.unprintable === true && plain) return undefined;
  if (effect.detached === true && attached) return undefined;
  return effect.why ?? 'may throw';
}

/**
 * Whether a call is one its entry says does not throw as written. `values` gives, for each argument, every value it
 * can have, or nothing when the compiler does not know them: then the call is not written, and nothing is said.
 */
export function quietAsWritten(effect: Effect, values: readonly (readonly unknown[] | undefined)[]): boolean {
  const written = effect.written;
  if (written === undefined) return false;
  return values.every((possible, index) => {
    const shape = written.shapes[index] ?? written.rest;
    return shape !== undefined && possible !== undefined && possible.length > 0 && possible.every((value) => hasShape(shape, value));
  });
}

// The shapes of written arguments on which a function of the DOM does not throw. Each is narrower than what the
// browser accepts: a value that has the shape is safe, one that has not is not known to be. They are written by
// hand from the DOM standard, and packages/ledger runs them in a browser before the ledger may name them.

/** The name of a shape, as the ledger writes it. */
export type Shape = 'token' | 'selector' | 'element-name' | 'attribute-name' | 'header-name' | 'colour' | 'unit' | 'flag' | 'text' | 'response-init';

const IDENT = '-?[A-Za-z_][A-Za-z0-9_-]*';
const QUOTED = `"[^"\\\\\\n]*"|'[^'\\\\\\n]*'`;
const ATTRIBUTE = `\\[${IDENT}(?:[~|^$*]?=(?:${QUOTED}|${IDENT}))?\\]`;
const PART = `(?:#${IDENT}|\\.${IDENT}|${ATTRIBUTE})`;
const COMPOUND = `(?:(?:${IDENT}|\\*)${PART}*|${PART}+)`;
const COMPLEX = `${COMPOUND}(?: *[>+~] *${COMPOUND}| +${COMPOUND})*`;
const SELECTOR = new RegExp(`^ *${COMPLEX}(?: *, *${COMPLEX})* *$`);
const BYTE = '\\d{1,3}';
const ALPHA = '(?:\\d+|\\d*\\.\\d+)';
const COLOUR = new RegExp(`^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\\( *${BYTE} *, *${BYTE} *, *${BYTE} *(?:, *${ALPHA} *)?\\))$`);

/** The statuses an answer with a body may have: 200 to 599, less the three that say there is no body. */
const hasBodyStatus = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 200 && value <= 599 && ![204, 205, 304].includes(value);
const HEADER_NAME = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
/** What a header may hold whatever its name: printable ASCII. */
const HEADER_VALUE = /^[\x20-\x7e]*$/;
const hasHeaders = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.entries(value).every(([name, held]) => HEADER_NAME.test(name) && typeof held === 'string' && HEADER_VALUE.test(held));

const shapes: Readonly<Record<Shape, (value: unknown) => boolean>> = {
  /** A token of a list of classes: not empty, and no ASCII whitespace in it. */
  token: (value) => typeof value === 'string' && /^[^\t\n\f\r ]+$/.test(value),
  /**
   * A selector made of names of elements, `#id`, `.class` and `[attribute]` or `[attribute="value"]`, joined by
   * the combinators and by commas. No pseudo-class, no escape, ASCII names only.
   */
  selector: (value) => typeof value === 'string' && SELECTOR.test(value),
  /** The name of an element, a custom one included: lower-case letters and digits, in parts joined by hyphens. */
  'element-name': (value) => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value),
  /**
   * `role`, `aria-…` and `data-…`. Not the attributes that run or load something (`onclick`, `src`, `srcdoc`):
   * a page can make the browser refuse a text there.
   */
  'attribute-name': (value) => typeof value === 'string' && /^(?:role|(?:aria|data)-[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.test(value),
  /** The name of an HTTP header: ASCII letters and digits, in parts joined by hyphens (`content-type`, `ETag`). */
  'header-name': (value) => typeof value === 'string' && HEADER_NAME.test(value),
  /** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, and `rgb(…)` or `rgba(…)` with numbers and commas. */
  colour: (value) => typeof value === 'string' && COLOUR.test(value),
  /** A number from 0 to 1. */
  unit: (value) => typeof value === 'number' && value >= 0 && value <= 1,
  flag: (value) => typeof value === 'boolean',
  text: (value) => typeof value === 'string',
  /**
   * What `new Response` is told of the answer: a `status` that an answer with a body may have, and `headers` written
   * as an object, each a header name with a text in printable ASCII. Nothing else: a `statusText` is refused on some
   * characters.
   */
  'response-init': (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(([name, held]) => (name === 'status' ? hasBodyStatus(held) : name === 'headers' && hasHeaders(held))),
};

/**
 * Whether a shape is one every value of a type has: any text has the shape `text`. An argument of that type need
 * not be written in the call.
 */
export const isShapeOfType = (shape: Shape, kinds: readonly string[]): boolean => shape === 'text' && kinds.length > 0 && kinds.every((kind) => kind === 'string');

/** Whether a value has a shape. */
export const hasShape = (shape: Shape, value: unknown): boolean => shapes[shape](value);

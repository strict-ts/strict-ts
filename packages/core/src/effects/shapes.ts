// The shapes of written arguments on which a function of the DOM does not throw. Each is narrower than what the
// browser accepts: a value that has the shape is safe, one that has not is not known to be. They are written by
// hand from the DOM standard, and packages/ledger runs them in a browser before the ledger may name them.

/** The name of a shape, as the ledger writes it. */
export type Shape = 'token' | 'selector' | 'element-name' | 'attribute-name' | 'header-name' | 'colour' | 'unit' | 'flag' | 'text';

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
  'header-name': (value) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/.test(value),
  /** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, and `rgb(…)` or `rgba(…)` with numbers and commas. */
  colour: (value) => typeof value === 'string' && COLOUR.test(value),
  /** A number from 0 to 1. */
  unit: (value) => typeof value === 'number' && value >= 0 && value <= 1,
  flag: (value) => typeof value === 'boolean',
  text: (value) => typeof value === 'string',
};

/** Whether a value has a shape. */
export const hasShape = (shape: Shape, value: unknown): boolean => shapes[shape](value);

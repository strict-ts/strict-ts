// A text of TypeScript, of JavaScript or of JSON as pieces with a kind: what the pages are coloured with when the
// site is built, and the sample of the front page as it is typed in. It reads no grammar: a word is coloured by what
// it is.

const KEYWORDS = new Set([
  'import', 'export', 'from', 'type', 'interface', 'class', 'extends', 'implements', 'function', 'const', 'let', 'var', 'return', 'if', 'else',
  'switch', 'case', 'default', 'for', 'of', 'in', 'while', 'do', 'break', 'continue', 'async', 'await', 'yield', 'true', 'false', 'null',
  'undefined', 'static', 'declare', 'new', 'readonly', 'private', 'protected', 'public', 'this', 'throw', 'try', 'catch', 'finally', 'as',
  'satisfies', 'typeof', 'keyof', 'instanceof', 'enum', 'namespace', 'void', 'delete',
]);
const TYPES = new Set(['string', 'number', 'bigint', 'boolean', 'unknown', 'never', 'any', 'object', 'symbol']);
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b)|([A-Za-z_$][\w$]*)|(=>|[{}()[\];,.:?|=<>+\-*/%!&])/g;

/** The pieces of a text, in order: `kind` is `com`, `str`, `num`, `kw`, `ty`, `fn`, `pun`, or undefined for the rest. */
export const tokens = (text) => {
  const pieces = [];
  let at = 0;
  for (const found of text.matchAll(TOKEN)) {
    if (found.index > at) pieces.push({ kind: undefined, text: text.slice(at, found.index) });
    const [whole, comment, string, number, name] = found;
    const next = text.charAt(found.index + whole.length);
    const kind =
      comment !== undefined ? 'com'
      : string !== undefined ? 'str'
      : number !== undefined ? 'num'
      : name === undefined ? 'pun'
      : KEYWORDS.has(name) ? 'kw'
      : TYPES.has(name) || /^[A-Z]/.test(name) ? 'ty'
      : next === '(' ? 'fn'
      : undefined;
    pieces.push({ kind, text: whole });
    at = found.index + whole.length;
  }
  if (at < text.length) pieces.push({ kind: undefined, text: text.slice(at) });
  return pieces;
};

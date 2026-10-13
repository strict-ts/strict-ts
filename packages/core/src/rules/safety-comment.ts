import type { Rule } from '../rule.js';
import type { Node } from '../syntax.js';
import { mut } from '../mut.js';

/** What the typing rules refuse outside unsafe/, and how the diagnostic names it. */
const unchecked = (node: Node): string | undefined => {
  if (node.kind === 'any-keyword') return '`any`';
  if (node.kind === 'as' && !node.isConst) return 'cast';
  if (node.kind === 'type-assertion') return 'cast';
  if (node.kind === 'non-null') return '`!` assertion';
  if (node.kind === 'definite-assignment') return 'definite assignment';
  if (node.kind === 'type-predicate') return 'type predicate';
  if (node.kind === 'ambient-declaration') return '`declare`';
  if (node.kind === 'function' && node.isOverload) return 'overload';
  return undefined;
};

const isComment = (line: string): boolean => {
  const text = line.trim();
  return text.startsWith('//') || text.startsWith('/*') || text.startsWith('*') || text.endsWith('*/');
};
/** `// SAFETY:` followed by at least one word: the reason. */
const SAFETY = /^\s*\/\/\s*SAFETY:\s*\S/;

/**
 * Whether the lines right above `offset` are comments, one of which says `// SAFETY: <reason>`. A blank line or a
 * line of code ends the search: the comment must touch what it justifies.
 */
function isJustified(text: string, offset: number): boolean {
  const above = mut(text.slice(0, text.lastIndexOf('\n', offset - 1) + 1).split('\n'));
  above.pop();
  for (let i = above.length - 1; i >= 0; i--) {
    const line = above[i] ?? '';
    if (!isComment(line)) return false;
    if (SAFETY.test(line)) return true;
  }
  return false;
}

export const safetyComment: Rule = {
  name: 'safety-comment',
  guarantee: 'typing',
  description: 'In unsafe/, an `any`, a cast, a `!`, a written type predicate or a `declare` is preceded by a comment that says why it holds: // SAFETY: <reason>.',
  scope: 'unsafe',
  visit(node, { file, report }, _parent, ancestors) {
    const what = unchecked(node);
    if (what === undefined) return;
    // One comment covers the statement, the declaration or the member it is above, whatever it holds.
    const unit = node.isUnit ? node : (ancestors.findLast((ancestor) => ancestor.isUnit) ?? node);
    if (isJustified(file.text, unit.start)) return;
    report(node, `Unchecked ${what} without a SAFETY comment.`, 'Say why this holds on the line above: // SAFETY: <reason>');
  },
};

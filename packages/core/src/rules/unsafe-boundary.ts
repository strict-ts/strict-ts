import type { Rule } from '../rule.js';
import { carriesAny, isOption, isResult } from './types.js';

export const unsafeBoundary: Rule = {
  name: 'unsafe-boundary',
  guarantee: 'typing',
  description: 'The functions unsafe/ exports must return Result/Option, and leak no `any`.',
  scope: 'unsafe',
  file({ exports, report }) {
    for (const exported of exports()) {
      if (exported.type.isAny) {
        report(exported, `The export "${exported.name}" has type \`any\`.`, 'Give it an explicit type.');
        continue;
      }
      for (const returned of exported.type.returns) {
        const value = returned.awaited;
        if (!isResult(value) && !isOption(value)) {
          report(
            exported,
            `"${exported.name}" leaves unsafe/ without Result/Option (returns ${value.text}).`,
            'Return Result<T, E> or Option<T>: it is the only way for an error to cross the boundary.',
          );
        } else if (carriesAny(value)) {
          report(exported, `"${exported.name}" returns a Result/Option that contains \`any\`.`, 'Use `unknown` or a validated type.');
        }
      }
    }
  },
};

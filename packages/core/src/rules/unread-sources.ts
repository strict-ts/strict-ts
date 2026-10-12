import type { Rule } from '../rule.js';

export const unreadSources: Rule = {
  name: 'unread-sources',
  guarantee: 'typing',
  description:
    'A source of the project that the gate does not read (a `.vue`, `.svelte` or `.astro` file) is refused as a whole: nothing in it is checked.',
  scope: 'project',
  project({ unreadSources, report }) {
    for (const file of unreadSources) {
      report(
        'This file is not read: nothing in it is checked.',
        'Keep its logic in `.ts` files that it imports, and accept the file itself in the baseline, in writing.',
        file,
      );
    }
  },
};

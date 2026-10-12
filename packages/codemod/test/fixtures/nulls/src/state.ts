// What stays inside the program: a state, a parameter, what a function gives back.
export interface Draft {
  readonly title: string;
  readonly topic: string | null;
}

export const empty: Draft = { title: '', topic: null };

export function withTopic(draft: Draft, topic: string | null): Draft {
  return { ...draft, topic };
}

export function topicOf(draft: Draft): string {
  if (draft.topic === null) return 'none';
  return draft.topic;
}

export const find = (drafts: readonly Draft[], title: string): Draft | null => drafts.find((draft) => draft.title === title) ?? null;

export const cleared = (draft: Draft): Draft => withTopic(draft, null);

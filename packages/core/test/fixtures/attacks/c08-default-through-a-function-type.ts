// A default that hides an undefined given on purpose, reached through a function type that says undefined is taken.
import type { Mut } from '@strict-ts/std';
type Topic = 'news' | 'sport';
const seen: Mut<string[]> = [];
const correct = (topic: Topic = 'news'): void => {
  seen.push(topic);
};
const clear: (topic: Topic | undefined) => void = correct;
clear(undefined);
if (seen[0] !== undefined) console.log('BROKEN c08: undefined was given and the function saw', seen[0]);

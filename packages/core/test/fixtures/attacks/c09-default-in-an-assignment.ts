// The same default, written in an assignment by a pattern.
const given: { readonly topic: 'news' | 'sport' | undefined } = { topic: undefined };
let topic: 'news' | 'sport' | undefined;
({ topic = 'news' } = given);
if (topic !== undefined) console.log('BROKEN c09: undefined was given and the pattern read', topic);
export {};

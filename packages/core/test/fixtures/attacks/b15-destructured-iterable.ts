// The first element of something that may be empty.
const none = new Set<number>();
const [first] = none;
const [letter] = '';
if (typeof first !== 'number') console.log('BROKEN b15: first is typed number and is', typeof first);
if (typeof letter !== 'string') console.log('BROKEN b15: letter is typed string and is', typeof letter);
export {};

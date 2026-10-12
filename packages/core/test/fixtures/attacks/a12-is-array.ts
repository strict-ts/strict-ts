// Array.isArray on a read-only array gives any[].
const first = (value: string | readonly string[]): string => (Array.isArray(value) ? value[0] : typeof value === 'string' ? value : '');
if (typeof first([]) !== 'string') console.log('BROKEN a12: first is typed string and is', typeof first([]));
export {};

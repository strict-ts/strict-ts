// A property of the page that throws when it is read: the storage, where the page may not use it. It cannot be
// shown by running this file outside a browser that denies storage; the HTML standard says it.
export const kept = (): number => localStorage.length;

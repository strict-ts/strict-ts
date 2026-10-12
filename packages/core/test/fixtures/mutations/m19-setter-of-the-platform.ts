// A parameter changed by a method of the platform that the list of mutators does not name.
function rewind(given: Date): void {
  given.setTime(0);
}
const when = new Date(1_000);
rewind(when);
if (when.getTime() !== 1_000) console.log('BROKEN m19: rewind takes no Mut and the date is', when.getTime());
export {};

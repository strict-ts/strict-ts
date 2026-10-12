// An object whose method says `this: Mut<…>`, given under a type whose member says nothing of it.
import type { Mut } from '@strict-ts/std';
type Log = { readonly record: (line: string) => void };
class Memory {
  lines: Mut<string[]> = [];
  record(this: Mut<Memory>, line: string): void {
    this.lines.push(line);
  }
}
function note(log: Log): void {
  log.record('x');
}
const memory = new Memory();
note(memory);
if (memory.lines.length !== 0) console.log('BROKEN m51: note takes no Mut and the memory holds', memory.lines.length);

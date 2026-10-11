// Runs the functions of the standard library on generated values, in a thread the main one can stop: a function
// that never returns must not stop the build.
import { parentPort, workerData } from 'node:worker_threads';
import { generate, instance, sequence, show } from './values.mjs';

const { jobs, runs, seed } = workerData;

/** What a declared function is at run time: how to call it, and on what. */
function locate(job) {
  const { owner, member } = job;
  if (owner === '') {
    const fn = globalThis[member];
    return typeof fn === 'function' ? { call: (_receiver, args) => fn(...args) } : undefined;
  }
  const base = owner.replace(/Constructor$/, '');
  const holder = globalThis[owner] ?? globalThis[base];
  if (owner.endsWith('Constructor')) {
    if (typeof holder !== 'function') return undefined;
    if (member === 'new') return { call: (_receiver, args) => new holder(...args) };
    if (member === '') return { call: (_receiver, args) => holder(...args) };
    return typeof holder[member] === 'function' ? { call: (_receiver, args) => holder[member](...args) } : undefined;
  }
  // A namespace: Math, JSON, Reflect.
  if (holder !== undefined && typeof holder !== 'function') return typeof holder[member] === 'function' ? { call: (_receiver, args) => holder[member](...args) } : undefined;
  // A method: called on a generated value of its owner.
  const receiverType = { k: 'library', name: owner, of: { k: 'any' }, and: { k: 'any' } };
  // Told on a value of the owner: a generator has no class to look the method up on.
  const sample = instance(receiverType, sequence(1), true);
  if (sample === undefined || sample === null || typeof sample[member] !== 'function') return undefined;
  return { receiverType, call: (receiver, args) => receiver[member](...args) };
}

const settle = (value) =>
  typeof value?.then === 'function'
    ? Promise.race([Promise.resolve(value).then(() => undefined, (error) => error ?? new Error('rejected')), new Promise((resolve) => setTimeout(resolve, 20))])
    : undefined;

for (const job of jobs) {
  const target = locate(job);
  if (target === undefined) {
    parentPort.postMessage({ name: job.name, located: false });
    continue;
  }
  const result = { name: job.name, located: true, modes: {} };
  for (const plain of [true, false]) {
    const random = sequence(seed + (plain ? 1 : 2));
    const byCount = {};
    for (let run = 0; run < runs; run++) {
      const signature = job.signatures[run % job.signatures.length];
      const required = signature.params.filter((parameter) => !parameter.optional && !parameter.rest).length;
      const most = signature.params.reduce((count, parameter) => count + (parameter.rest ? 2 : 1), 0);
      const count = required + Math.floor(random.next() * (most - required + 1));
      const args = [];
      for (const parameter of signature.params) {
        if (args.length >= count) break;
        args.push(generate(parameter.type, random, plain));
        if (parameter.rest && args.length < count) args.push(generate(parameter.type, random, plain));
      }
      const receiver = target.receiverType === undefined ? undefined : instance(target.receiverType, random, plain);
      if (target.receiverType !== undefined && receiver === undefined) continue;
      const tally = (byCount[args.length] ??= { runs: 0, threw: 0 });
      tally.runs++;
      let error;
      try {
        error = await settle(target.call(receiver, args));
      } catch (caught) {
        error = caught ?? new Error('threw');
      }
      // A result too long for the engine to hold is a limit of the machine, like running out of memory: not counted.
      if (error !== undefined && error?.message === 'Invalid string length') {
        tally.tooLong = (tally.tooLong ?? 0) + 1;
      } else if (error !== undefined) {
        tally.threw++;
        tally.example ??= `${target.receiverType === undefined ? '' : `${show(receiver)} · `}(${args.map(show).join(', ')}) → ${error?.name ?? 'Error'}`;
      }
    }
    result.modes[plain ? 'plain' : 'any'] = byCount;
  }
  parentPort.postMessage(result);
}
parentPort.postMessage({ done: true });

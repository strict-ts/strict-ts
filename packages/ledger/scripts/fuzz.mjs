// Runs every runnable function of the library in a worker thread, and restarts past a function that never returns.
import { Worker } from 'node:worker_threads';

/**
 * `{ [name]: { located, timedOut?, modes: { plain, any } } }` where a mode maps a number of arguments to how many
 * runs were made with it, how many threw, and an example.
 */
export async function fuzz(library, { runs = 300, seed = 20261011, patience = 4000 } = {}) {
  const jobs = library.filter((entry) => entry.runnable);
  const results = {};
  let next = 0;
  while (next < jobs.length) {
    const batch = jobs.slice(next);
    await new Promise((resolve) => {
      const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { jobs: batch, runs, seed }, stderr: true, stdout: true });
      let received = 0;
      let timer;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          // The function being run did not come back: it is left out, and the rest goes on in a new thread.
          results[batch[received].name] = { located: true, timedOut: true, modes: {} };
          next += received + 1;
          void worker.terminate().then(resolve);
        }, patience);
      };
      arm();
      worker.on('message', (message) => {
        if (message.done) {
          clearTimeout(timer);
          next = jobs.length;
          void worker.terminate().then(resolve);
          return;
        }
        results[message.name] = message;
        received++;
        arm();
      });
      worker.on('error', () => {
        clearTimeout(timer);
        results[batch[received]?.name ?? '?'] = { located: true, crashed: true, modes: {} };
        next += received + 1;
        resolve();
      });
    });
  }
  return results;
}

import { mut } from '@strict-ts/std';
// What the instrumented code calls. It is not imported: its text is put at the top of each instrumented module, so
// that instrumented code needs nothing installed where it runs. Hence one function, no import, and plain JavaScript
// in its body: it is read with `toString`.

/** Installs the probes on the global object, once, and returns them. `file` is where events are appended. */
export function install(file: string): unknown {
  const root: { __strictTsProbe?: unknown; process?: { getBuiltinModule?: (name: string) => unknown; on?: (event: string, listener: () => void) => void } } =
    globalThis;
  if (root.__strictTsProbe !== undefined) return root.__strictTsProbe;

  const fs = root.process?.getBuiltinModule?.('node:fs') as
    | { appendFileSync: (path: string, text: string) => void; mkdirSync: (path: string, options: { recursive: boolean }) => void }
    | undefined;
  const write = (event: unknown): void => {
    try {
      fs?.mkdirSync(file.slice(0, Math.max(file.lastIndexOf('/'), 0)) || '.', { recursive: true });
      fs?.appendFileSync(file, `${JSON.stringify(event)}\n`);
    } catch {
      // A probe that cannot write must not change what the code does.
    }
  };
  const describe = (error: unknown): string =>
    error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : String(error).slice(0, 300);

  const sites: unknown[] = mut([]);
  // How many times each site ran since the last write. Written at the end of the turn of the event loop that ran
  // them, and not when the process exits: a test runner stops its workers without letting them say goodbye.
  const counts = mut(new Map<number, number>());
  let waiting = false;
  const flush = (): void => {
    waiting = false;
    for (const [index, count] of counts) write({ type: 'ran', site: sites[index], count });
    counts.clear();
  };
  const ran = (index: number): void => {
    counts.set(index, (counts.get(index) ?? 0) + 1);
    if (waiting) return;
    waiting = true;
    setTimeout(flush, 0);
  };
  root.process?.on?.('exit', flush);

  const mismatch = (value: unknown, shape: { k: string; v?: unknown; of?: unknown; props?: Record<string, { shape: unknown; optional: boolean }> }, path: string): string[] | undefined => {
    const found = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const wrong = (expected: string): string[] => [path || '(the value)', expected, found];
    switch (shape.k) {
      case 'unknown':
        return undefined;
      case 'literal':
        return value === shape.v ? undefined : wrong(JSON.stringify(shape.v));
      case 'null':
        return value === null ? undefined : wrong('null');
      case 'array': {
        if (!Array.isArray(value)) return wrong('array');
        for (let i = 0; i < Math.min(value.length, 50); i++) {
          const inner = mismatch(value[i], shape.of as never, `${path}[${i}]`);
          if (inner !== undefined) return inner;
        }
        return undefined;
      }
      case 'object': {
        if (typeof value !== 'object' || value === null) return wrong('object');
        for (const [name, property] of Object.entries(shape.props ?? {})) {
          const held = (value as Record<string, unknown>)[name];
          if (held === undefined && property.optional) continue;
          const inner = mismatch(held, property.shape as never, `${path}.${name}`);
          if (inner !== undefined) return inner;
        }
        return undefined;
      }
      case 'union': {
        const members = shape.of as { k: string }[];
        return members.some((member) => mismatch(value, member as never, path) === undefined) ? undefined : wrong(members.map((member) => member.k).join(' | '));
      }
      default:
        return found === shape.k ? undefined : wrong(shape.k);
    }
  };

  const freeze = (value: unknown, depth: number): unknown => {
    if (typeof value !== 'object' || value === null || depth > 6 || Object.isFrozen(value)) return value;
    const prototype = Object.getPrototypeOf(value);
    // Only plain data: freezing a Map, a Date or an instance of a class would not stop what changes them.
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;
    Object.freeze(value);
    for (const inner of Object.values(value)) freeze(inner, depth + 1);
    return value;
  };

  /** Runs a call to outside code. What it throws is recorded and thrown again, unchanged. */
  const guard = (index: number, run: () => unknown): unknown => {
    let result: unknown;
    try {
      result = run();
    } catch (error) {
      write({ type: 'threw', site: sites[index], error: describe(error) });
      throw error;
    }
    ran(index);
    if (typeof result === 'object' && result !== null && typeof (result as { then?: unknown }).then === 'function') {
      (result as Promise<unknown>).then(undefined, (error: unknown) => write({ type: 'threw', site: sites[index], error: describe(error) }));
    }
    return result;
  };

  const probe = {
    /** Declares the sites of a module; returns the index of its first one. */
    sites(declared: unknown[]): number {
      const first = sites.length;
      sites.push(...declared);
      return first;
    },
    /** `receiver[name](...args)`, a call to outside code. Its receiver and arguments were computed before: what is caught is the call's own. */
    method(index: number, receiver: Record<PropertyKey, (...args: unknown[]) => unknown>, name: PropertyKey, args: unknown[]): unknown {
      return guard(index, () => (receiver[name] as (...args: unknown[]) => unknown)(...args));
    },
    /** `callee(...args)`. */
    fn(index: number, callee: (...args: unknown[]) => unknown, args: unknown[]): unknown {
      return guard(index, () => callee(...args));
    },
    /** `new callee(...args)`. */
    make(index: number, callee: new (...args: unknown[]) => unknown, args: unknown[]): unknown {
      return guard(index, () => new callee(...args));
    },
    /** An exception that leaves a function exported by an unsafe directory. */
    escaped(index: number, error: unknown): void {
      write({ type: 'escaped', site: sites[index], error: describe(error) });
    },
    /** The value of a cast, checked against the shape of its type and returned as it is. */
    cast(index: number, value: unknown, shape: never): unknown {
      const wrong = mismatch(value, shape, '');
      if (wrong !== undefined) write({ type: 'miscast', site: sites[index], at: wrong[0], expected: wrong[1], found: wrong[2] });
      return value;
    },
    /** A value declared read-only where it is made: frozen, so that changing it through any name throws. */
    frozen(value: unknown): unknown {
      return freeze(value, 0);
    },
  };
  root.__strictTsProbe = probe;
  return probe;
}

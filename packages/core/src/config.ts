/** See `Config.assume`. */
export const assumptions = ['attached-buffers', 'dom-as-observed', 'generated-receivers'] as const;
export type Assumption = (typeof assumptions)[number];

export interface Config {
  /**
   * The directories where unchecked code may live, relative to the project root: the equivalent of Rust's `unsafe`.
   * A file is unsafe when its path starts with one of them. A single file may be named too, for the one a tool
   * wants at a fixed place: the configuration of a bundler, a declaration file a framework generates.
   */
  readonly unsafeDirs: readonly string[];
  /** The packages safe code may import; everything else is imported from an unsafe directory only. */
  readonly allowedImports: readonly string[];
  /**
   * The directories whose code must be pure, relative to the project root: no I/O, no clock, no randomness, no
   * global state. None when absent.
   */
  readonly pureDirs?: readonly string[];
  /**
   * The directories that hold tests, relative to the project root; `test` and `tests` when absent. A file named
   * `*.test.*` or `*.spec.*`, or under a `__tests__` directory, is a test wherever it is. A test is checked like any
   * code, except that it may throw, call what throws and import what it needs to test: as in Rust, where a test
   * may panic.
   */
  readonly testDirs?: readonly string[];
  /**
   * What the project says of itself and that no rule can check. Each is a risk the project takes in writing:
   * `attached-buffers`: no buffer is ever detached (transferred to another thread, resized away), so the methods of
   * typed arrays and of `DataView` do not throw for that.
   * `dom-as-observed`: a function of the DOM that was called in a browser on generated values and never threw is
   * taken not to throw, although no specification was read for it; and one that throws is taken not to on
   * arguments written in the call, of a shape on which it never threw there.
   * `generated-receivers`: a method called with arguments written in the call, that did not throw when the gate ran
   * it with them on a list of receivers of its class, is taken not to throw on the receiver it will have.
   */
  readonly assume?: readonly Assumption[];
  /** The names of the rules to run; all of them when absent. */
  readonly rules?: readonly string[];
}

export const defaultConfig: Config = {
  unsafeDirs: ['src/unsafe'],
  allowedImports: ['@strict-ts/std'],
};

const normalised = (dirs: readonly string[]): readonly string[] =>
  dirs.map((dir) => dir.trim().replace(/^\.?\/+/, '').replace(/\/+$/, '')).filter((dir) => dir.length > 0);

const isUnder = (fileName: string, dirs: readonly string[]): boolean => normalised(dirs).some((dir) => fileName === dir || fileName.startsWith(`${dir}/`));

export function isUnsafe(fileName: string, config: Config): boolean {
  return isUnder(fileName, config.unsafeDirs);
}

/** Whether a file belongs to a directory declared pure. */
export function isPure(fileName: string, config: Config): boolean {
  return isUnder(fileName, config.pureDirs ?? []);
}

/** Whether a file is a test: see `Config.testDirs`. */
export function isTest(fileName: string, config: Config): boolean {
  return isUnder(fileName, config.testDirs ?? ['test', 'tests']) || /(?:^|\/)__tests__\//.test(fileName) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(fileName);
}

/** See `Config.assume`. */
export const assumptions = ['attached-buffers'] as const;
export type Assumption = (typeof assumptions)[number];

export interface Config {
  /**
   * The directories where unchecked code may live, relative to the project root: the equivalent of Rust's `unsafe`.
   * A file is unsafe when its path starts with one of them.
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
   * What the project says of itself and that no rule can check. Each is a risk the project takes in writing:
   * `attached-buffers`: no buffer is ever detached (transferred to another thread, resized away), so the methods of
   * typed arrays and of `DataView` do not throw for that.
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

const isUnder = (fileName: string, dirs: readonly string[]): boolean => normalised(dirs).some((dir) => fileName.startsWith(`${dir}/`));

export function isUnsafe(fileName: string, config: Config): boolean {
  return isUnder(fileName, config.unsafeDirs);
}

/** Whether a file belongs to a directory declared pure. */
export function isPure(fileName: string, config: Config): boolean {
  return isUnder(fileName, config.pureDirs ?? []);
}

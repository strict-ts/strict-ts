export interface Config {
  /**
   * The directories where unchecked code may live, relative to the project root: the equivalent of Rust's `unsafe`.
   * A file is unsafe when its path starts with one of them.
   */
  readonly unsafeDirs: readonly string[];
  /** The packages safe code may import; everything else is imported from an unsafe directory only. */
  readonly allowedImports: readonly string[];
  /** The names of the rules to run; all of them when absent. */
  readonly rules?: readonly string[];
}

export const defaultConfig: Config = {
  unsafeDirs: ['src/unsafe'],
  allowedImports: ['@strict-ts/std'],
};

export function isUnsafe(fileName: string, config: Config): boolean {
  return config.unsafeDirs
    .map((dir) => dir.trim().replace(/^\.?\/+/, '').replace(/\/+$/, ''))
    .some((dir) => dir.length > 0 && fileName.startsWith(`${dir}/`));
}

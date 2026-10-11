// Ambient declarations for the fixtures, which are compiled without @types/node.
declare const console: {
  log(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<any>;
}
declare function fetch(url: string): Promise<FetchResponse>;

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
}

declare module "node:crypto" {
  export function randomUUID(): string;
}

declare module "zod" {
  export const z: any;
}

// A library as they are written: any, null, exceptions that the types do not show, overloads, a class.
export declare const VERSION: string;
export declare const RETRIES: 3;
export declare const settings: { get(key: string): string };
export declare function parse(text: string): any;
export declare function find(id: string): { name: string } | null;
export declare function load(url: string): Promise<string>;
export declare function loadJson(url: string): Promise<any>;
export declare function lookup(id: string): Promise<string | undefined>;
export declare function first<T>(items: readonly T[]): T;
export declare function format(value: number): string;
export declare function format(value: Date, pattern: string): string;
export declare function stop(code: number): never;
export declare class Client {
  constructor(url: string);
  send(body: string): void;
}
export interface Options {
  retries: number;
}
declare const client: Client;
export default client;

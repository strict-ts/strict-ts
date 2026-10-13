// Shows dist/ on this machine, to read the site before it is put anywhere: `pnpm site && pnpm site:serve [port]`.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../dist', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.argv[2] ?? 4173);

createServer(async (request, response) => {
  const asked = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname));
  const path = asked.endsWith('/') ? `${asked}index.html` : asked;
  try {
    // `normalize` took every `..` out of an address that starts with a slash: the file is under dist/.
    const content = await readFile(`${out}${path}`);
    response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(content);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not a page of the site.\n');
  }
}).listen(port, '127.0.0.1', () => console.log(`site: http://127.0.0.1:${port}/`));

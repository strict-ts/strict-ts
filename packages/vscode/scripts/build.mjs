// Builds the VS Code extension under dist/: `extension/`, a folder the editor can load as it is, and `strict-ts.vsix`,
// the same folder as the one file « Install from VSIX » takes. A VSIX is a zip; it is written here, without a tool.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const plugin = fileURLToPath(new URL('../../language-service/', import.meta.url));
const out = `${root}dist/extension/`;

rmSync(`${root}dist`, { recursive: true, force: true });
cpSync(`${root}extension`, out, { recursive: true });
// The plugin goes where the TypeScript server looks for it: in the extension's own node_modules.
const target = `${out}node_modules/@strict-ts/language-service/`;
mkdirSync(`${target}dist`, { recursive: true });
cpSync(`${plugin}dist/index.cjs`, `${target}dist/index.cjs`);
writeFileSync(`${target}package.json`, `${JSON.stringify({ name: '@strict-ts/language-service', version: '0.0.0', main: './dist/index.cjs' }, undefined, 2)}\n`);

const manifest = JSON.parse(readFileSync(`${out}package.json`, 'utf8'));

/** Every file under a directory, as paths relative to it. */
const files = (directory, prefix = '') =>
  readdirSync(directory)
    .toSorted()
    .flatMap((name) => (statSync(`${directory}${name}`).isDirectory() ? files(`${directory}${name}/`, `${prefix}${name}/`) : [`${prefix}${name}`]));

const entries = [
  {
    name: '[Content_Types].xml',
    data: Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension=".json" ContentType="application/json"/><Default Extension=".md" ContentType="text/markdown"/>' +
        '<Default Extension=".cjs" ContentType="application/javascript"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>',
    ),
  },
  {
    name: 'extension.vsixmanifest',
    data: Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">' +
        `<Metadata><Identity Language="en-US" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}"/>` +
        `<DisplayName>${manifest.displayName}</DisplayName><Description xml:space="preserve">${manifest.description}</Description>` +
        `<Categories>${manifest.categories.join(',')}</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${manifest.engines.vscode}"/></Properties></Metadata>` +
        '<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>' +
        '<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>',
    ),
  },
  ...files(out).map((name) => ({ name: `extension/${name}`, data: readFileSync(`${out}${name}`) })),
];

// A zip whose files are stored as they are: a local header before each, then the directory of them all.
const parts = [];
const directory = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name);
  const sum = crc32(entry.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(entry.data.length, 18);
  local.writeUInt32LE(entry.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt32LE(sum, 16);
  central.writeUInt32LE(entry.data.length, 20);
  central.writeUInt32LE(entry.data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  parts.push(local, name, entry.data);
  directory.push(central, name);
  offset += local.length + name.length + entry.data.length;
}
const listed = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(listed.length, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(`${root}dist/strict-ts.vsix`, Buffer.concat([...parts, listed, end]));
console.log(`vscode: dist/extension/, dist/strict-ts.vsix (${entries.length} files)`);

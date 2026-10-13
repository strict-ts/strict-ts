// Wraps in mut(…) what is made in place and given where Mut<…> is asked, as the compiler points at it.
// usage: node mutfix.mjs <typescript module path> <tsconfig> [--dry]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [tsPath, configPath, flag] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const ts = require(tsPath);
const dry = flag === '--dry';
const run = () => {
  const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const program = ts.createProgram(config.fileNames, { ...config.options, noEmit: true, composite: false, incremental: false });
  const checker = program.getTypeChecker();
  const edits = new Map();
  const left = [];
  const seen = new Set();
  const wrappable = (e) => {
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isArrayLiteralExpression(e) || ts.isObjectLiteralExpression(e) || ts.isNewExpression(e)) return true;
    if (ts.isCallExpression(e)) {
      const c = e.expression;
      const name = ts.isPropertyAccessExpression(c) ? c.name.text : ts.isIdentifier(c) ? c.text : '';
      return ['slice', 'map', 'filter', 'concat', 'flat', 'flatMap', 'toSorted', 'toReversed', 'from', 'of', 'fromEntries', 'entries', 'keys', 'values', 'structuredClone', 'split', 'createElement'].includes(name);
    }
    return false;
  };
  for (const d of program.getSemanticDiagnostics()) {
    const text = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    if (!d.file || d.file.fileName.includes('node_modules') || !text.includes('[MUT]')) continue;
    let node = ts.getTokenAtPosition ? ts.getTokenAtPosition(d.file, d.start) : undefined;
    const find = (n) => ts.forEachChild(n, (c) => (d.start >= c.getStart(d.file) && d.start < c.getEnd() ? find(c) : undefined)) ?? n;
    node = find(d.file);
    // The expression that is given: climb to the declaration, the property, the return, or stay on the argument.
    let target;
    for (let n = node; n && !target; n = n.parent) {
      if (ts.isVariableDeclaration(n) && n.name.getStart(d.file) <= d.start && d.start < n.name.getEnd()) target = n.initializer;
      else if ((ts.isPropertyDeclaration(n) || ts.isPropertyAssignment(n)) && n.name.getStart(d.file) <= d.start && d.start < n.name.getEnd()) target = n.initializer;
      else if (ts.isReturnStatement(n) && n.getStart(d.file) === d.start) target = n.expression;
      else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && n.left.getStart(d.file) <= d.start && d.start < n.left.getEnd()) target = n.right;
      if (ts.isStatement(n)) break;
    }
    // An argument, or a value in a list or an object written in place: the expression the error is on.
    for (let n = node; n && !target; n = n.parent) {
      if (ts.isExpression(n) && n.getStart(d.file) === d.start && d.start + d.length === n.getEnd() && !(ts.isIdentifier(n) && n.parent && (ts.isVariableDeclaration(n.parent) || ts.isPropertyDeclaration(n.parent) || ts.isPropertyAssignment(n.parent)) && n.parent.name === n)) target = n;
      if (ts.isStatement(n)) break;
    }
    const where = `${path.relative(process.cwd(), d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}`;
    if (!target || !wrappable(target)) { left.push(`${where} ${text.split('\n')[0].slice(0, 110)}`); continue; }
    const key = `${d.file.fileName}:${target.getStart(d.file)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = edits.get(d.file.fileName) ?? [];
    list.push({ at: target.getStart(d.file), text: 'mut(' }, { at: target.getEnd(), text: ')' });
    edits.set(d.file.fileName, list);
  }
  let count = 0;
  for (const [file, list] of edits) {
    let text = readFileSync(file, 'utf8');
    for (const e of list.sort((a, b) => b.at - a.at || (a.text === ')' ? -1 : 1))) text = text.slice(0, e.at) + e.text + text.slice(e.at);
    count += list.length / 2;
    // The name `mut`, next to `Mut`, from wherever the file takes it.
    if (!/\bmut\b[^(]*\} from/.test(text.split('\n').filter((l) => l.startsWith('import')).join('\n'))) {
      text = text.replace(/import type \{ Mut \} from (['"][^'"]+['"]);/, 'import { mut, type Mut } from $1;');
      if (!/import \{[^}]*\bmut\b/.test(text)) text = text.replace(/import type \{([^}]*)\bMut\b([^}]*)\} from (['"][^'"]+['"]);/, (m, a, b, from) => `import { mut } from ${from};\n${m}`);
      if (!/import \{[^}]*\bmut\b/.test(text)) text = text.replace(/import \{([^}]*)\btype Mut\b([^}]*)\} from (['"][^'"]+['"]);/, 'import {$1mut, type Mut$2} from $3;');
    }
    if (!dry) writeFileSync(file, text);
  }
  return { count, left };
};
let total = 0;
for (let pass = 0; pass < 6; pass++) {
  const { count, left } = run();
  total += count;
  if (count === 0 || dry) { console.log(`wrapped ${total}; left ${left.length}`); for (const l of left.slice(0, 60)) console.log('  ' + l); break; }
}

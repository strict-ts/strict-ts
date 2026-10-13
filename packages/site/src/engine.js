// The checker for the samples of the front page: `@strict-ts/core` behind the engine of the playground, asked about
// one file. The site judges its samples with this script when it is built, and the page loads the same script when
// a sample is changed. No rule is here.
import { rules } from '@strict-ts/core';
import { createPlayground } from '@strict-ts/playground/engine';

/** Where a position of a text is, counted in characters from its start. */
const offsets = (text) => {
  const starts = [0];
  for (let at = 0; at < text.length; at += 1) if (text.charCodeAt(at) === 10) starts.push(at + 1);
  return ({ line, column }) => (starts[line - 1] ?? text.length) + column - 1;
};

/**
 * `compiler` is TypeScript 6, `environment` what a file is compiled against (the libraries of the compiler, the
 * sources of the standard library), `flags` the compiler options of a conforming project.
 */
export const create = (compiler, environment, flags) => {
  const playground = createPlayground(compiler, environment);
  const enabledRules = rules.map((rule) => rule.name);
  return {
    /**
     * What is refused in one file, each refusal in the words of the command line, with where it is in the text
     * when it is in it.
     */
    judge(name, source) {
      const file = `src/${name}`;
      const { diagnostics } = playground.check({ files: { [file]: source }, unsafeDirs: ['src/unsafe'], allowedImports: ['@strict-ts/std'], compilerFlags: flags, enabledRules });
      const at = offsets(source);
      return diagnostics.map((diagnostic) => {
        const inside = diagnostic.file === file;
        const place = inside ? `${name}:${diagnostic.start.line}:${diagnostic.start.column} ` : diagnostic.file === '' ? '' : `${diagnostic.file}:${diagnostic.start.line}:${diagnostic.start.column} `;
        const text = `${place}${diagnostic.rule} ${diagnostic.message}${diagnostic.help === undefined ? '' : `\n  help: ${diagnostic.help}`}`;
        return inside ? { text, start: at(diagnostic.start), end: at(diagnostic.end) } : { text };
      });
    },
  };
};

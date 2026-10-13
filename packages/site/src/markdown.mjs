// Markdown of the repository to the HTML of a page: headings that can be linked to, code in colours, and links that
// lead to a page of the site. The documentation is in the site: nothing of it sends its reader to the repository.
import { posix } from 'node:path';
import { Marked } from 'marked';
import { tokens } from './tokens.js';

export const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** A text of TypeScript, of JavaScript or of JSON, in colours. */
export const paint = (code) => tokens(code).map((piece) => (piece.kind === undefined ? escape(piece.text) : `<span class="${piece.kind}">${escape(piece.text)}</span>`)).join('');

/** A block that names its language is coloured; one that names none is what a command printed, and is shown as it is. */
const PAINTED = new Set(['ts', 'tsx', 'js', 'json']);

/** The anchor of a heading, as Gitea and GitHub make it: the documents link to each other with these. */
export const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replaceAll(' ', '-');

const plain = (markdown) => markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '');

/**
 * Where a link written in a file of the repository leads, from a page of the site. `pages` says which files of the
 * repository are pages. A file that is not a page gives nothing: its name is shown, and is not a link.
 */
export const linker = ({ from, out, pages }) => (href) => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return href;
  const cut = href.indexOf('#');
  const [path, hash] = cut === -1 ? [href, ''] : [href.slice(0, cut), href.slice(cut)];
  const target = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, '');
  const page = pages.get(target);
  if (page === undefined) return undefined;
  return `${posix.relative(posix.dirname(out), page) || posix.basename(page)}${hash}`;
};

/** Markdown to `{ title, html, headings }`: the first title is taken out of the text, and given apart. */
export const render = (markdown, link = (href) => href) => {
  const headings = [];
  const seen = new Map();
  let title;
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens: inside, depth, text }) {
        const words = plain(text);
        if (depth === 1 && title === undefined) {
          title = words;
          return '';
        }
        const base = slug(words);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        headings.push({ depth, id, text: words });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${this.parser.parseInline(inside)}</h${depth}>\n`;
      },
      link({ href, tokens: inside }) {
        const to = link(href);
        if (to === undefined) return this.parser.parseInline(inside);
        const outside = /^[a-z][a-z0-9+.-]*:/i.test(to);
        return `<a href="${escape(to)}"${outside ? ' rel="noopener"' : ''}>${this.parser.parseInline(inside)}</a>`;
      },
      code({ text, lang }) {
        const language = (lang ?? '').trim();
        return `<pre class="code"><code>${PAINTED.has(language) ? paint(text) : escape(text)}</code></pre>\n`;
      },
      table(token) {
        const cell = (one, tag) => `<${tag}${one.align ? ` style="text-align:${one.align}"` : ''}>${this.parser.parseInline(one.tokens)}</${tag}>`;
        // A table with an empty header is two columns of « what » and « how »: the header is not shown.
        const head = token.header.every((one) => one.text.trim() === '') ? '' : `<thead><tr>${token.header.map((one) => cell(one, 'th')).join('')}</tr></thead>`;
        const rows = token.rows.map((row) => `<tr>${row.map((one) => cell(one, 'td')).join('')}</tr>`).join('\n');
        return `<div class="table"><table>${head}<tbody>\n${rows}\n</tbody></table></div>\n`;
      },
    },
  });
  const html = marked.parse(markdown);
  return { title: title ?? '', html, headings };
};

/** The text under a heading of the second level, up to the next one. */
export const sectionOf = (markdown, heading) => {
  const lines = markdown.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) throw new Error(`no section « ${heading} »`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
};

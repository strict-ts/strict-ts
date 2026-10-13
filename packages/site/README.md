# @strict-ts/site

The website of strict-ts: a front page, the documents of the repository as pages, and the playground. It is written
as a folder of files that any server of files shows; it loads nothing from elsewhere, no CDN and no font. Not
published.

```sh
pnpm build && pnpm site      # writes packages/site/dist/
pnpm site:serve              # shows it at http://127.0.0.1:4173/
```

It is an adapter around `core`, with no rule in it, and it writes as little as it can by hand:

- **The pages of the documentation are `docs/*.md`, `examples/README.md`, `CONTRIBUTING.md`, `CHANGELOG.md` and the
  README of each package**, as they are at the commit the site is built from, and each example is a page that shows
  its sources. A link to another document leads to its page, with its anchor, and a link to a file that is not a
  page is shown as its name, with no link. Only the foot names the repository. A block of code that names its
  language is coloured; one that names none is what a command printed.
- **The samples of the front page are judged by the checker when the site is built** (`src/demos`: each as
  `tsc --strict` accepts it, `.classic.ts`, and as it conforms, `.strict.ts`). What the page shows under a sample is
  a line per refusal, in the words of the command line. Once a sample is changed, the checker is loaded in the page
  and asked again: the compiler (`assets/typescript.js`), what a file is compiled against
  (`assets/environment.js`) and `assets/engine.js`, which is `src/engine.js` around the engine of the playground. It
  is the script the build judged the samples with.
- **The scoreboard, the questions, the figures and the commands** are the sections and the blocks of `README.md` and
  of `docs/`, not copies of them: a figure the README no longer gives stops the build. The list of the rules is
  `core`'s.
- **The playground** is a page of the site, under the same bar: `playground.html`. What it shows is handed by
  [`@strict-ts/playground`](../playground), the engine and the interface, which stay under the gate; its style and
  markup are in a shadow tree, so that its sheet and the site's do not meet. There is no other playground.
- **The search** looks into every section of the documentation, in the page: `/` opens it.

The tests build the site and follow every link of it: a page or an anchor that is named and is not there fails
(`test/site.test.ts`).

## What is not checked

The site is plain JavaScript, as the build scripts of the other packages are: the gate does not run on it. No test
opens it in a browser: the script of the front page was tried by hand, and the test only says that the checker it
loads refuses the samples.

## Online

`Dockerfile` at the root of the repository builds the site and serves `dist/` with nginx: it is what a host that
builds from the repository is given.

It is on the Coolify of the house, at <https://strict-ts.adserver.fr>. A push to `main` builds and shows it again (a
webhook of the Gitea repository); the foot of each page names the commit it was built from.

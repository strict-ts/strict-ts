# Contributing

```sh
pnpm lint && pnpm build && pnpm test && pnpm check && pnpm corpus && pnpm probe && pnpm ledger
```

`pnpm corpus` runs the gate on a fixed set of projects (the packages, the examples, the fixtures) and compares what
each rule refuses with `corpus/expected.json`; any difference fails, so a rule cannot start refusing more or less
without a word. `pnpm corpus --external` adds open source projects cloned at a pinned commit, and `--update` records
a change that is meant.

`pnpm check` runs strict-ts on its own packages, as the CI does. All pass with nothing recorded, except `std`, whose
baseline can only shrink. Build before testing: the adapters' tests load the built packages.

Node ≥ 22.13. The work (backlog, milestones), the specs and one RFC page per rule are in Plane, project
[STS](https://plane.adserver.fr/alex/projects/2c1f2990-e14d-4f3d-9186-ebbe292b8c8f/issues/); this repo holds the code,
the pull requests and the CI. A new rule starts with its RFC: the guarantee it serves, one refused example and its
fix, the cost in lines measured on the examples, the known false positives.

## Releasing

A release is a tag. With the changelog written and merged:

```sh
git tag v1.2.3 && git push origin v1.2.3
```

The workflow `Release` runs every check of the CI on the tag, then publishes std, core, cli and the fixer under that
version and the tag `latest`: on the registry of the Gitea, and on npmjs.org as well when the secret `NPMJS_TOKEN` is
set. The versions written in the `package.json` files stay `0.0.0`: the version comes from the tag.
`node scripts/publish-pilot.mjs --dry-run --release 1.2.3` says what would be published.

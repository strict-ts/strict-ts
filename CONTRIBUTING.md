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

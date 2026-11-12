## 2026-11-12, Dependabot follow-up: TypeScript 7 reason, ws (#532)

Two corrections to #527. The TypeScript 7 ignore named the wrong reason:
`src/runner/engine.ts` compiles with sucrase, not `typescript`. The
reason that holds is that TypeScript 7's package no longer exports
`bin/tsc` or the JavaScript compiler API, which `npm run check` and
typescript-eslint's parser use; the comment and the earlier note now say
so.

`npm dedupe` in #527 hoisted chord's exact optional peer `ws` 8.21.0,
moving every other user of `ws` back from 8.22.0, and moved `internmap`
from 2.0.3 to 1.0.1. The lockfile is back to the one npm wrote for the
bumps, with no downgrades; chord stays nested twice, which costs disk
space only.

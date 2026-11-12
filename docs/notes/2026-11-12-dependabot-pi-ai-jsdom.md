## 2026-11-12, Dependabot: pi-ai 1.5, jsdom 31, no TypeScript 7 (#526)

Two Dependabot pull requests had failed `build` since 2026-11-10 and sat
open. This takes both updates with the changes they need.

pi-ai 1.5.0 dropped its re-export of TypeBox's `Type`. Its tools now
take JSON Schema built with `@earendil-works/pi-schema`, which pi-ai
already depends on, so the agent's three tool schemas use pi-schema's
builders (`obj`, `oneOf`, `int`, `opt`, `str`) and the package lists
pi-schema itself rather than relying on the transitive copy. Two
differences in the JSON Schema: the string choices become `enum` rather
than `anyOf` of `const`s, and `obj()` is closed (`additionalProperties:
false`), so a tool call with an unknown argument is now rejected rather
than ignored. That is the stricter choice for tools that edit and run
the notebook, so it stays closed.

jsdom 31 serializes `font-feature-settings: "ss01" 1` as `"ss01"`, the
canonical form browsers also return, since 1 is the default value. The
settings test now expects that form; the string the app writes is
unchanged.

Dependabot now skips TypeScript 7 and later: the native compiler has no
compiler API, which `src/runner/engine.ts` uses. cdp-kernel and
ganymede-device skip it for the same reason.

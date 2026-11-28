## 2026-11-28, language features e2e spec (#680)

Added [`e2e/language-features.spec.ts`](../../e2e/language-features.spec.ts)
now that CI runs `@tlockney/cdp-kernel` 0.16.0 with the `cdp-kernel.language.v1`
comm. The spec opens a two-cell notebook on `cdp-node`, declares a typed
function in the first cell, types a call in the second cell to verify signature
help and active-parameter highlighting, checks that Escape dismisses the tooltip
while keeping edit mode, jumps to the declaration in the first cell with F12,
and renames the symbol across both cells with F2.

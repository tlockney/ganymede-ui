## 2026-11-06, changelog misses squash merges (#326)

The 0.4.0 release PR (#325) listed 51 of its 75 pull requests: every
squash-merged PR was missing. `cliff.toml`'s squash preprocessor matched
`\(#(\d+)\)\s*$` against the whole message, and without `(?m)` the `$`
is the end of the body, not of the subject. GitHub's squash commits carry
a body (the branch's commit list, `Co-authored-by` lines), so none
matched, and the catch-all parser dropped them. Merge commits were fine
because the first preprocessor collapses them to one line first.

Matching the subject alone isn't enough: commits on a PR branch often end
in `(#N)` too (the issue they work on), and over v0.3.0..v0.4.0 that would
add 103 of them. What tells them apart is the committer: GitHub
commits merges and squashes (`committer.name` is `GitHub`), while branch
commits keep their author's. The parser now requires that.

Regenerating the whole changelog with the fix leaves 0.2.0 and 0.3.0
unchanged, gives 0.4.0 its 75 entries, and adds #7 to 0.1.0, a squash
merge that was missed the same way.

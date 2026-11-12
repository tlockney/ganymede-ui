## 2026-11-12, Dependencies: xmldom, fast-uri and sanitize-html advisories (#545)

Dependabot alerts are off in this repo, so the daily Dependabot sweep
runs `npm audit --omit=dev` instead. Its first run found 37 advisories in
shipped dependencies. Two fixes were in range: speech-rule-engine 4.1.5
(under MathJax) moves `@xmldom/xmldom` from 0.9.10 to 0.9.12, and
`fast-uri` (under ajv) moves to 3.1.9.

sanitize-html is the one that matters here: JupyterLab's sanitizer uses
it to clean untrusted HTML output and Markdown before it renders in the
page. Every JupyterLab release, 4.7.6 included, pins it to `~2.12.1`, and
the XSS fixes are in 2.18.x. `package.json` now overrides it to 2.18.2
for `@jupyterlab/apputils` only. 2.18 dropped `deepmerge`, which clears
that advisory too. `src/lib/sanitizer.test.ts` checks that JupyterLab's
`Sanitizer` still keeps safe markup and styles and drops event handlers
and `javascript:` URLs with the newer release. Drop the override once
JupyterLab allows a fixed sanitize-html.

Left: a low KaTeX advisory (trust bypass that needs an existing
prototype pollution) under mermaid 11. The fixed KaTeX needs mermaid 12,
and `@jupyterlab/mermaid` requires `^11.15.0`.

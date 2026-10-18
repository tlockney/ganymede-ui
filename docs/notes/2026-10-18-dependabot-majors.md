## 2026-10-18, Dependabot majors (#24)

Dependabot's first grouped npm PR (#22) carried 17 bumps, five of them
majors (TypeScript 7, Vite 8, Vitest 5, vite-plugin-pwa 2, Font Awesome 7)
plus `@jupyterlite/javascript-kernel` alpha.5, which is broken on npm. One
group means one failure holds back every patch bump.

The npm group now takes only minor and patch bumps; each major opens its
own PR, to take or close on its merits. The JavaScript kernel is ignored
(bump it by hand once a release is complete), and so are Font Awesome
majors, since ipywidgets writes Font Awesome 5 class names.

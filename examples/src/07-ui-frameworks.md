# UI Frameworks

A cell can build its output with a UI framework, in two ways:

- **Render in the kernel.** The cell renders components to an HTML string
  and shows it. The output is static, and works in any notebook viewer.
- **Run in the output.** The cell shows HTML with a `<script>` that loads
  the framework and mounts the component. The output is interactive. Ganymede
  runs it in a sandboxed frame, once the notebook is trusted, so it can't
  reach the app or the kernel; data goes in when the cell runs.

To have a component talk back to the kernel, use a widget.

## React, rendered in the kernel

`react-dom/server` renders components to HTML. Cells understand JSX: the
kernel compiles it to `React.createElement` calls, so import `React`.

```ts
import React from "npm:react@19";
import { renderToStaticMarkup } from "npm:react-dom@19/server";

type Moon = { name: string; radiusKm: number; orbitDays: number };
const moons: Moon[] = [
  { name: "Io", radiusKm: 1821.6, orbitDays: 1.769 },
  { name: "Europa", radiusKm: 1560.8, orbitDays: 3.551 },
  { name: "Ganymede", radiusKm: 2634.1, orbitDays: 7.155 },
  { name: "Callisto", radiusKm: 2410.3, orbitDays: 16.689 },
];

function MoonCard({ moon, largest }: { moon: Moon; largest: number }) {
  const size = 24 + (moon.radiusKm / largest) * 56;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8 }}>
      <div style={{ width: size, height: size, borderRadius: "50%", background: "#e3974a" }} />
      <div>
        <strong>{moon.name}</strong>
        <div style={{ opacity: 0.7, fontSize: 13 }}>
          {moon.radiusKm.toLocaleString("en-US")} km, one orbit in {moon.orbitDays} days
        </div>
      </div>
    </div>
  );
}

const largest = Math.max(...moons.map(m => m.radiusKm));
const markup = renderToStaticMarkup(
  <div style={{ fontFamily: "system-ui" }}>
    {moons.map(m => <MoonCard key={m.name} moon={m} largest={largest} />)}
  </div>,
);
jupyter.html`${markup}`;
```

## React, running in the output

The same data, as a component with state: a sort order you click. The
script loads React from esm.sh in the output's frame. `JSON.stringify`
passes the cell's data in.

```ts
jupyter.html`<div id="root"></div>
<script type="module">
  import React, { useState } from "https://esm.sh/react@19";
  import { createRoot } from "https://esm.sh/react-dom@19/client";
  const h = React.createElement;
  const moons = ${JSON.stringify(moons)};
  const keys = { name: "Name", radiusKm: "Radius", orbitDays: "Orbit" };

  function Table() {
    const [key, setKey] = useState("orbitDays");
    const sorted = [...moons].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
    return h("div", { style: { fontFamily: "system-ui" } },
      h("div", { style: { marginBottom: 8 } }, "Sort by ",
        Object.entries(keys).map(([k, label]) =>
          h("button", { key: k, onClick: () => setKey(k), style: { marginRight: 4, fontWeight: k === key ? "bold" : "normal" } }, label))),
      h("table", null, h("tbody", null, sorted.map(m =>
        h("tr", { key: m.name }, h("td", null, m.name), h("td", null, m.radiusKm + " km"), h("td", null, m.orbitDays + " days"))))));
  }
  createRoot(document.getElementById("root")).render(h(Table));
</script>`;
```

## Preact and htm

[Preact](https://preactjs.com) is a 4 kB React alternative, and
[htm](https://github.com/developit/htm) gives JSX-like templates with no
build step. A counter with hooks:

```ts
jupyter.html`<div id="app"></div>
<script type="module">
  import { h, render } from "https://esm.sh/preact@10";
  import { useState } from "https://esm.sh/preact@10/hooks";
  import htm from "https://esm.sh/htm@3";
  const html = htm.bind(h);

  function Counter({ start }) {
    const [count, setCount] = useState(start);
    return html\`<div style="font-family: system-ui; display: flex; gap: 8px; align-items: center">
      <button onClick=\${() => setCount(count - 1)}>−</button>
      <strong style="min-width: 2em; text-align: center">\${count}</strong>
      <button onClick=\${() => setCount(count + 1)}>+</button>
    </div>\`;
  }
  render(html\`<\${Counter} start=\${${moons.length}} />\`, document.getElementById("app"));
</script>`;
```

## Web components with Lit

[Lit](https://lit.dev) builds standard web components, which work with or
without a framework.

```ts
jupyter.html`<moon-phase days="7.155"></moon-phase>
<script type="module">
  import { LitElement, html, css } from "https://esm.sh/lit@3";
  class MoonPhase extends LitElement {
    static properties = { days: { type: Number }, t: { state: true } };
    static styles = css\`:host { font-family: system-ui; display: block } svg { display: block }\`;
    constructor() { super(); this.t = 0; }
    connectedCallback() {
      super.connectedCallback();
      this.timer = setInterval(() => (this.t += 0.05), 50);
    }
    disconnectedCallback() { clearInterval(this.timer); super.disconnectedCallback(); }
    render() {
      const angle = (this.t / this.days) * 2 * Math.PI;
      const x = 90 + Math.cos(angle) * 70, y = 90 + Math.sin(angle) * 70;
      return html\`<svg width="180" height="180">
        <circle cx="90" cy="90" r="70" fill="none" stroke="#8886"/>
        <circle cx="90" cy="90" r="18" fill="#e3974a"/>
        <circle cx=\${x} cy=\${y} r="6" fill="#4f7cac"/>
      </svg><div>Ganymede, one orbit every \${this.days} days (sped up)</div>\`;
    }
  }
  customElements.define("moon-phase", MoonPhase);
</script>`;
```

# Widgets

A widget is a control in a cell's output that stays connected to the
kernel: move a slider and code in the kernel runs; change a value in the
kernel and the control follows. `jupyter.widget` makes one in the
[anywidget](https://anywidget.dev) format: the view is a small JavaScript
module, and the kernel and every view of it share a state object.

Ganymede draws each view in a sandboxed frame, so a widget can't reach the
app. The saved widgets below show their last state; run the cells to bring
them to life.

## A counter

The view is a module whose `render({ model, el })` draws into `el`. A click
changes the model and `save_changes()` sends it to the kernel.

```ts
const counter = jupyter.widget({
  esm: `export default {
    render({ model, el }) {
      const button = document.createElement("button");
      const update = () => { button.textContent = "Clicked " + model.get("count") + " times"; };
      button.onclick = () => {
        model.set("count", model.get("count") + 1);
        model.save_changes();
      };
      model.on("change:count", update);
      update();
      el.append(button);
    },
  };`,
  css: `button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 1px solid #4f7cac; background: #4f7cac22; cursor: pointer; }`,
  state: { count: 0 },
});
counter;
```

The kernel reads the count after a few clicks, and can set it too:

```ts
counter.set("count", 10);
counter.get("count");
```

## The kernel reacts

A slider sets a planet's orbit; a listener in the kernel works out its
period with Kepler's third law and sends it back for the view to show.

```ts
const orbit = jupyter.widget({
  esm: `export default {
    render({ model, el }) {
      const slider = Object.assign(document.createElement("input"), { type: "range", min: "0.2", max: "40", step: "0.1" });
      const label = document.createElement("div");
      const update = () => {
        slider.value = model.get("au");
        label.textContent = model.get("au") + " AU from the Sun: one orbit takes " + model.get("years") + " years";
      };
      slider.oninput = () => { model.set("au", slider.valueAsNumber); model.save_changes(); };
      model.on("change", update);
      update();
      el.append(slider, label);
    },
  };`,
  state: { au: 5.2, years: 11.86 },
});

orbit.on("change:au", au => {
  orbit.set("years", Number((Number(au) ** 1.5).toFixed(2)));
});
orbit;
```

## A chart the kernel redraws

The view sends the chosen seed with `model.send`; the kernel draws a new
SVG and sets it in the state, and the view shows it. The work happens in
the kernel, the view stays small.

```ts
function walk(seed: number, steps = 400) {
  let x = 0, s = seed;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    x += s / 2 ** 31 - 0.5;
    points.push(`${(i * 600) / steps},${(100 - x * 6).toFixed(1)}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><polyline points="${points.join(" ")}" fill="none" stroke="#e3974a" stroke-width="1.5"/></svg>`;
}

const chart = jupyter.widget({
  esm: `export default {
    render({ model, el }) {
      const button = document.createElement("button");
      button.textContent = "New walk";
      const figure = document.createElement("div");
      const update = () => { figure.innerHTML = model.get("svg"); };
      button.onclick = () => model.send({ seed: Math.floor(Math.random() * 1e6) });
      model.on("change:svg", update);
      update();
      el.append(button, figure);
    },
  };`,
  state: { svg: walk(1) },
});
chart.on("msg:custom", content => chart.set("svg", walk((content as { seed: number }).seed)));
chart;
```

## One model, several views

Display the same widget again and both views stay in step: move either
slider.

```ts
orbit;
```

## Binary data

State can hold bytes. Here the kernel draws a picture as SVG and sets its
bytes; the view shows them as an image and asks for a new hue.

```ts
async function swatch(hue: number) {
  const stripes = Array.from({ length: 24 }, (_, i) =>
    `<rect x="${i * 10}" width="10" height="80" fill="hsl(${hue + i * 4} 60% ${30 + i * 2}%)"/>`);
  return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80">${stripes.join("")}</svg>`);
}

const palette = jupyter.widget({
  esm: `export default {
    render({ model, el }) {
      const img = document.createElement("img");
      const slider = Object.assign(document.createElement("input"), { type: "range", min: "0", max: "360" });
      const update = () => {
        const svg = model.get("svg");
        img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        slider.value = model.get("hue");
      };
      slider.onchange = () => { model.set("hue", slider.valueAsNumber); model.save_changes(); };
      model.on("change:svg", update);
      update();
      el.append(img, document.createElement("br"), slider);
    },
  };`,
  state: { hue: 200, svg: await swatch(200) },
});
palette.on("change:hue", async hue => palette.set("svg", await swatch(Number(hue))));
palette;
```

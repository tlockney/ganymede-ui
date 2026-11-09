# Device

In the Ganymede apps, TypeScript cells can use the device they run on
through a global named `device`: the clipboard, haptics, dialogs, the share
sheet, files, photos and sounds. The app answers each call from Swift.

This notebook has no saved outputs, because the answers depend on your
device. Run the cells one at a time: several open a dialog or a picker.

`device` exists in the kernel the app runs itself, "TypeScript
(cdp-kernel)" (on the Mac, "TypeScript (cdp-kernel, in app)"). Kernels on
a server can ask for the methods that need no permission. Everywhere else
it is `undefined`, so each cell checks first. The
[Device API page](https://github.com/tlockney/ganymede-ui/blob/main/docs/device.md)
lists every method and where it works.

## What this device offers

`device.info()` says which platform this is and which methods the app
answers. `device.has(method)` checks one.

```ts no-run
if (typeof device === "undefined") {
  console.log("No device here: open this notebook in the Ganymede app and pick its TypeScript kernel.");
} else {
  const info = await device.info();
  jupyter.md`**${info.platform}** ${info.osVersion}, Ganymede ${info.appVersion}${info.model ? `, ${info.model}` : ""}

${info.battery ? `Battery ${Math.round((info.battery.level ?? 0) * 100)}%${info.battery.charging ? ", charging" : ""}. ` : ""}${info.darkMode ? "Dark mode. " : ""}Locale ${info.locale ?? "unknown"}.

Methods: ${info.capabilities.map(c => `\`${c}\``).join(", ")}`;
}
```

A helper for the cells below: run `use` only where the method works, and
say so where it doesn't.

```ts no-run
async function where<T>(method: string, use: () => Promise<T>): Promise<T | string> {
  if (typeof device === "undefined") return "No device here.";
  if (!device.has(method)) return `This device doesn't offer ${method}.`;
  return use();
}
```

## Clipboard

Copy text from a cell, then read it back. On iPhone and iPad, reading can
show the system's paste prompt.

```ts no-run
await where("clipboard.writeText", () => device.clipboard.writeText(`Copied from a notebook at ${new Date().toLocaleTimeString()}`));
await where("clipboard.readText", () => device.clipboard.readText());
```

A chart from a cell can go to the clipboard as an image, ready to paste
into another app.

```ts no-run
const canvas = new OffscreenCanvas(240, 120);
const g = canvas.getContext("2d")!;
[38, 72, 55, 90, 64].forEach((v, i) => {
  g.fillStyle = `hsl(${200 + i * 15} 50% 50%)`;
  g.fillRect(10 + i * 46, 120 - v, 36, v);
});
const png = await canvas.convertToBlob({ type: "image/png" });
await where("clipboard.writeImage", () => device.clipboard.writeImage(png));
```

## Dialogs

Native alerts, confirmations, text prompts, action sheets and date pickers.
Dismissing one is not an error: it returns `null` or `false`.

```ts no-run
const name = await where("ui.prompt", () => device.ui.prompt("What should the greeting say?", { title: "Greeting", placeholder: "Your name" }));
typeof name === "string" && name ? `Hello, ${name}!` : name;
```

```ts no-run
const choice = await where("ui.actionSheet", () =>
  device.ui.actionSheet("Pick a moon", ["Io", "Europa", "Ganymede", "Callisto"], { cancel: "None" }));
choice;
```

```ts no-run
await where("ui.pickDate", () => device.ui.pickDate({ mode: "date", title: "Pick a day" }));
```

## Haptics

Only iPhones have a Taptic Engine, so on an iPad or a Mac this cell says
so instead.

```ts no-run
await where("haptics.impact", async () => {
  for (const style of ["light", "medium", "heavy"] as const) {
    await device.haptics.impact(style);
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  await device.haptics.notification("success");
  return "Felt that?";
});
```

## Sound

A sound made in the cell: a WAV file of a short chord, generated sample by
sample.

```ts no-run
function wav(frequencies: number[], seconds = 1.2, rate = 44100) {
  const n = Math.floor(seconds * rate);
  const data = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); data.setUint32(4, 36 + n * 2, true); text(8, "WAVEfmt ");
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
  text(36, "data"); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t * 20) * Math.exp(-3 * t);
    const v = frequencies.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) / frequencies.length;
    data.setInt16(44 + i * 2, v * envelope * 0.8 * 32767, true);
  }
  return new Uint8Array(data.buffer);
}
await where("sound.play", () => device.sound.play(wav([261.63, 329.63, 392.0])));
```

## Files and photos

Pick files or photos; they come in by value, as `File`s. Here, a picked
text or CSV file's first lines.

```ts no-run
const files = await where("files.pick", () => device.files.pick({ types: ["text/plain", "text/csv"] }));
if (Array.isArray(files) && files[0]) {
  const lines = (await files[0].text()).split("\n").slice(0, 5);
  jupyter.md`**${files[0].name}**, ${files[0].size.toLocaleString("en-US")} bytes\n\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
} else files;
```

```ts no-run
const photos = await where("photos.pick", () => device.photos.pick({ limit: 1 }));
if (Array.isArray(photos) && photos[0]) {
  const bitmap = await createImageBitmap(photos[0]);
  const scale = Math.min(1, 480 / bitmap.width);
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  jupyter.image(new Uint8Array(await blob.arrayBuffer()));
} else photos;
```

Save something the notebook made, with the system's save panel or document
picker:

```ts no-run
const report = `moon,radius_km\nIo,1821.6\nEuropa,1560.8\nGanymede,2634.1\nCallisto,2410.3\n`;
await where("files.export", () => device.files.export(new TextEncoder().encode(report), { name: "moons.csv" }));
```

## Share and open

The share sheet, and links in Safari or in the app.

```ts no-run
await where("share", () => device.share({ text: "Notebooks on my phone, with no server.", url: "https://ganymede-server.com" }));
```

```ts no-run
await where("openURL", () => device.openURL("https://en.wikipedia.org/wiki/Ganymede_(moon)", { inApp: true }));
```

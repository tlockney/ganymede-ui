# DuckDB

[DuckDB](https://duckdb.org) is an analytical SQL database. Its
WebAssembly build, `@duckdb/duckdb-wasm`, runs in the notebook with no
server: it reads CSV, JSON and Parquet files over HTTP and keeps tables in
memory.

## Start the database

DuckDB runs in a Worker of its own. Its script comes from the jsDelivr
CDN; a small Blob script loads it, since a page can only start a Worker
from its own origin.

```ts
import * as duckdb from "npm:@duckdb/duckdb-wasm@1.29.0";

const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
const loader = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(loader));
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
URL.revokeObjectURL(loader);
const conn = await db.connect();
(await conn.query("select version() as version")).toArray()[0].toJSON();
```

## Show a result as a table

A query returns an Apache Arrow table. This helper turns one into a
Markdown table, and is the cell's result.

```ts
async function sql(query: string, limit = 20) {
  const table = await conn.query(query);
  const fields = table.schema.fields;
  const show = (v: unknown, type: string) => {
    if (v === null || v === undefined) return "";
    if (type.startsWith("Date") || type.startsWith("Timestamp")) return new Date(Number(v)).toISOString().slice(0, 10);
    const n = typeof v === "bigint" ? Number(v) : v;
    if (typeof n !== "number") return String(n);
    if (!Number.isInteger(n)) return n.toFixed(2);
    return Math.abs(n) >= 10_000 ? n.toLocaleString("en-US") : String(n);
  };
  const rows = table.toArray().slice(0, limit).map(r => `| ${fields.map(f => show(r[f.name], String(f.type))).join(" | ")} |`);
  const more = table.numRows > limit ? `\n\n${table.numRows - limit} more rows` : "";
  return jupyter.md`| ${fields.map(f => f.name).join(" | ")} |\n| ${fields.map(() => "---").join(" | ")} |\n${rows.join("\n")}${more}`;
}

await sql(`select 'Ganymede' as moon, 2634.1::double as radius_km, 1610 as discovered, date '1610-01-07' as first_seen`);
```

## Query a file over HTTP

DuckDB reads a remote CSV as a table, guessing its columns' types. Here,
four years of Seattle weather.

```ts
await conn.query(`
  create table seattle as
  select * from read_csv_auto('https://raw.githubusercontent.com/vega/vega-datasets/v2.11.0/data/seattle-weather.csv')
`);
await sql(`describe seattle`);
```

```ts
await sql(`
  select year(date) as year,
         round(avg(temp_max), 1) as avg_high,
         round(sum(precipitation)) as rain_mm,
         count(*) filter (where weather = 'sun') as sunny_days
  from seattle
  group by year
  order by year
`);
```

Parquet is read in ranges, so a query fetches only the columns and row
groups it needs. This file holds every New York yellow cab trip of April
2019, 127 MB, but the query below reads two of its columns.

```ts
const taxi = "https://blobs.duckdb.org/data/taxi_2019_04.parquet";
await sql(`
  select passenger_count as passengers, count(*) as trips
  from '${taxi}'
  where passenger_count between 1 and 6
  group by passengers
  order by passengers
`);
```

## Data from a cell

Data the notebook already has goes in as JSON. Here, the strongest
earthquakes of the past week, from the US Geological Survey.

```ts
const feed = await (await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson")).json();
const quakes = feed.features.map((f: any) => ({
  magnitude: f.properties.mag,
  place: f.properties.place,
  depth_km: f.geometry.coordinates[2],
}));
await db.registerFileText("quakes.json", JSON.stringify(quakes));
await conn.insertJSONFromPath("quakes.json", { name: "quakes" });
await sql(`
  select case when depth_km < 70 then 'shallow' when depth_km < 300 then 'intermediate' else 'deep' end as depth,
         count(*) as quakes,
         max(magnitude) as strongest
  from quakes
  group by depth
  order by min(depth_km)
`);
```

## Results into charts

A query's rows are plain objects too. Monthly rain as bars, straight from
SQL into SVG:

```ts
const months = (await conn.query(`
  select month(date) as m, round(avg(precipitation) * 30, 1) as rain
  from seattle group by m order by m
`)).toArray().map(r => ({ m: Number(r.m), rain: r.rain as number }));
const max = Math.max(...months.map(d => d.rain));
const names = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const bars = months.map((d, i) => {
  const h = (d.rain / max) * 160;
  return `<rect x="${i * 44 + 4}" y="${180 - h}" width="36" height="${h}" rx="3" fill="#4f7cac"/>
    <text x="${i * 44 + 22}" y="198" text-anchor="middle">${names[d.m - 1]}</text>
    <text x="${i * 44 + 22}" y="${174 - h}" text-anchor="middle">${d.rain}</text>`;
});
jupyter.svg`<svg xmlns="http://www.w3.org/2000/svg" width="532" height="206" font-family="system-ui" font-size="10" fill="#888">${bars.join("")}</svg>`;
```

## Clean up

Closing the connection and terminating the database frees its memory.
Restarting the kernel does the same.

```ts
await conn.close();
await db.terminate();
```

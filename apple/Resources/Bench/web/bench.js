// The workloads in this web view's Workers, each in a fresh Worker. Sets
// window.benchResult to a report shaped like the V8 one, shows it, and
// posts it to the "bench" handler (BenchWorkerPage.swift). Derived from
// the V8 spike's bench/web/bench.js (ganymede spikes/v8-engine) without
// its kernel-start step: the apps bundle no standalone copy of cdp-kernel's
// browser kernel to load it from (#698).
//
// ?repeats=N sets the calls per workload (default 5).

const params = new URLSearchParams(location.search);
const repeats = Number(params.get("repeats") ?? 5);
const base = new URL("../", location.href);
const text = async (rel) => (await fetch(new URL(rel, base))).text();

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

function next(worker) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => (e.data.op === "error" ? reject(new Error(e.data.error)) : resolve(e.data));
    worker.onerror = (e) => reject(new Error(e.message || "worker error"));
  });
}

async function runWorkload({ name, sources }) {
  const report = { name, error: null, heap: null };
  const texts = await Promise.all(sources.map(text));
  let t = performance.now();
  const worker = new Worker(new URL("worker.js", location.href));
  try {
    await next(worker);
    report.start_ms = performance.now() - t;
    t = performance.now();
    worker.postMessage({ op: "load", sources: texts });
    await next(worker);
    report.load_ms = performance.now() - t;
    const times = [];
    for (let i = 0; i < repeats; i++) {
      t = performance.now();
      worker.postMessage({ op: "run" });
      const { result } = await next(worker);
      times.push(performance.now() - t);
      report.result_bytes = new TextEncoder().encode(result).length;
      report.result_preview = result.slice(0, 80);
    }
    report.first_ms = times[0];
    report.steady_ms = median(times.slice(1));
    report.cold_ms = report.start_ms + report.load_ms + report.first_ms;
  } catch (e) {
    report.error = String(e.message ?? e);
  } finally {
    worker.terminate();
  }
  return report;
}

const status = document.getElementById("status");
const post = (report) => window.webkit?.messageHandlers?.bench?.postMessage(JSON.stringify(report));

try {
  const manifest = JSON.parse(await text("workloads/manifest.json"));
  const workloads = [];
  for (const w of manifest.workloads) {
    status.textContent = `Running ${w.name}…`;
    workloads.push(await runWorkload(w));
  }
  const report = {
    engine: "worker",
    version: navigator.userAgent,
    jitless: false,
    init_ms: 0,
    workloads,
    max_rss_bytes: null,
  };
  window.benchResult = report;
  status.textContent = "Done.";
  document.getElementById("out").textContent = JSON.stringify(report, null, 2);
  post(report);
} catch (e) {
  // A missing manifest or the like: the app gets an error, not a silence.
  const report = { error: String((e && e.message) || e) };
  status.textContent = "Failed.";
  document.getElementById("out").textContent = report.error;
  post(report);
}

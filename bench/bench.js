// Memory + speed benchmark for geojson-vt.
//
// Run:  npm run bench
//   or: node --expose-gc bench/bench.js [dataset1 dataset2 ...]
//   or: node --expose-gc --max-old-space-size=8192 bench/bench.js
//
// Reports per dataset, three phases:
//
//   init   — geojsonvt(data, {})                  default options
//   drill  — init, then a fixed sample of getTile() calls across z=7..10
//   deep   — geojsonvt(data, {indexMaxZoom, indexMaxPoints: 0})
//
// Measurement methodology (important — original bench had two bugs):
//
//   1. WARM-UP first. JSON.parse leaves V8's heap badly fragmented;
//      compaction triggered by the *first* index build dominates the delta
//      and can produce negative "held" numbers. We build-then-discard once
//      to settle V8 before measuring.
//
//   2. COUNT arrayBuffers + external. `process.memoryUsage().heapUsed` does
//      NOT include ArrayBuffer backing stores or other off-heap memory.
//      A refactor that moves coords into Float64Array would APPEAR to free
//      huge amounts of memory when it actually just relocated bytes off-heap.
//      We report heap + ab + ext as the "total" V8-tracked memory.
//
//   3. RSS is the OS-level truth but doesn't shrink immediately when V8 frees
//      memory; useful as sanity check, not for fine deltas.
//
// Numbers are not directly comparable across machines but ARE comparable
// across geojson-vt versions on the same machine.

import {readFileSync, existsSync} from 'fs';
import {performance} from 'perf_hooks';
import GeoJSONVT from '../src/index.js';

if (!global.gc) {
    console.error('run with --expose-gc (or via `npm run bench`)');
    process.exit(1);
}

const DATASETS = [
    {name: 'earthquakes', file: 'debug/data/earthquakes.json',           note: 'points',          deep: {indexMaxZoom: 10, indexMaxPoints: 0}},
    {name: 'route',       file: 'debug/data/route.json',                 note: 'linestring',      deep: {indexMaxZoom: 12, indexMaxPoints: 0}},
    {name: 'hrr',         file: 'debug/data/hrr.json',                   note: 'polygons',        deep: {indexMaxZoom: 8,  indexMaxPoints: 0}},
    {name: 'us-2010',     file: 'debug/data/gz_2010_us_050_00_500k.json', note: 'polygons (22M)', deep: {indexMaxZoom: 7,  indexMaxPoints: 0}},
    {name: 'county',      file: 'debug/data/county.json',                note: 'polygons (205M)', deep: null}
];

const DRILL = [
    {z: 7,  xs: [30, 31, 32],    ys: [45, 46, 47]},
    {z: 8,  xs: [60, 61, 62],    ys: [90, 91, 92]},
    {z: 10, xs: [240, 241, 242], ys: [360, 361, 362]}
];

const wantNames = process.argv.slice(2);
const datasets = (wantNames.length ? DATASETS.filter(d => wantNames.includes(d.name)) : DATASETS)
    .filter(d => {
        const ok = existsSync(new URL('../' + d.file, import.meta.url));
        if (!ok) console.error(`skipping ${d.name}: ${d.file} not found`);
        return ok;
    });

function settle() {
    // Many GC passes — V8's incremental GC + external memory cleanup
    // sometimes needs several rounds to reach steady state.
    for (let i = 0; i < 8; i++) global.gc();
}
function mem() {
    settle();
    const m = process.memoryUsage();
    // total = heap + off-heap (ArrayBuffer backing stores + other external memory)
    // arrayBuffers is reported as a *subset* of external on Node.
    return {
        heap: m.heapUsed,
        ab: m.arrayBuffers,
        ext: m.external,
        rss: m.rss,
        total: m.heapUsed + m.external
    };
}
function memNoGC() {
    const m = process.memoryUsage();
    return {
        heap: m.heapUsed,
        ab: m.arrayBuffers,
        ext: m.external,
        rss: m.rss,
        total: m.heapUsed + m.external
    };
}

function kb(bytes) { return Math.round(bytes / 1024); }
function fmtKB(b)  { return b == null ? '—' : `${kb(b)} KB`; }
function fmtMs(t)  { return t == null ? '—' : t.toFixed(1); }

function buildIndex(data, opts) {
    const t0 = performance.now();
    let index, error;
    try {
        index = new GeoJSONVT(data, opts);
    } catch (e) {
        error = e;
    }
    const elapsed = performance.now() - t0;
    return {index, elapsed, error};
}

function runDrill(index) {
    const t0 = performance.now();
    let calls = 0;
    for (const {z, xs, ys} of DRILL) {
        for (const x of xs) for (const y of ys) {
            index.getTile(z, x, y);
            calls++;
        }
    }
    return (performance.now() - t0) / calls;
}

function runOne(dataset) {
    process.stderr.write(`${dataset.name}… `);

    // Load data
    const data = JSON.parse(readFileSync(new URL('../' + dataset.file, import.meta.url), 'utf8'));

    // Warm-up: build + discard + GC. This settles V8's heap into a steady
    // state, so the actual measurement isn't dominated by the heap
    // fragmentation that JSON.parse left behind. One warmup is enough on
    // average; two for safety on the biggest datasets.
    buildIndex(data, {});
    settle();

    const baseline = mem();
    process.stderr.write(`baseline heap=${kb(baseline.heap)} ext=${kb(baseline.ext)} rss=${kb(baseline.rss)} `);

    // Phase 1: init (default options)
    const init = buildIndex(data, {});
    if (init.error) {
        process.stderr.write(`init failed: ${init.error.message}\n`);
        return {name: dataset.name, note: dataset.note, error: init.error.message};
    }
    const peakSnap = memNoGC();
    const afterInit = mem();
    const initPeak = peakSnap.total - baseline.total;
    const initHeld = afterInit.total - baseline.total;

    // Phase 2: drill (same index, lazy drilldown via getTile)
    const drillMs = runDrill(init.index);
    const afterDrill = mem();
    const drillHeld = afterDrill.total - baseline.total;

    // release init index before phase 3
    let initIndex = init.index; void initIndex; initIndex = null;
    settle();

    // Phase 3: deep (eager pre-tiling, separate index build)
    let deep = null;
    if (dataset.deep) {
        // warm-up for deep as well, since options differ
        buildIndex(data, dataset.deep);
        settle();
        const deepBase = mem();
        const r = buildIndex(data, dataset.deep);
        if (r.error) {
            deep = {error: r.error.message};
        } else {
            const dp = memNoGC();
            const da = mem();
            deep = {
                elapsed: r.elapsed,
                peak: dp.total - deepBase.total,
                held: da.total - deepBase.total,
                opts: dataset.deep
            };
            void r.index;
        }
    }

    process.stderr.write('done\n');
    return {
        name: dataset.name,
        note: dataset.note,
        init: {elapsed: init.elapsed, peak: initPeak, held: initHeld,
               heapHeld: afterInit.heap - baseline.heap,
               abHeld:   afterInit.ab   - baseline.ab,
               extHeld:  afterInit.ext  - baseline.ext},
        drill: {meanMs: drillMs, held: drillHeld},
        deep
    };
}

const results = [];
for (const ds of datasets) {
    try {
        results.push(runOne(ds));
    } catch (e) {
        process.stderr.write(`crashed: ${e.message}\n`);
        results.push({name: ds.name, note: ds.note, error: e.message});
    }
}

// Table
const cols = [
    {h: 'dataset',     w: 12, get: r => r.name},
    {h: 'init ms',     w:  9, get: r => fmtMs(r.init?.elapsed)},
    {h: 'init peak',   w: 11, get: r => fmtKB(r.init?.peak)},
    {h: 'init held',   w: 11, get: r => fmtKB(r.init?.held)},
    {h: 'heap held',   w: 11, get: r => fmtKB(r.init?.heapHeld)},
    {h: 'ext held',    w: 11, get: r => fmtKB(r.init?.extHeld)},
    {h: 'getTile ms',  w: 11, get: r => fmtMs(r.drill?.meanMs)},
    {h: 'drill held',  w: 11, get: r => fmtKB(r.drill?.held)},
    {h: 'deep ms',     w:  9, get: r => fmtMs(r.deep?.elapsed)},
    {h: 'deep peak',   w: 11, get: r => fmtKB(r.deep?.peak)},
    {h: 'deep held',   w: 11, get: r => fmtKB(r.deep?.held)}
];

const pad = (s, n) => String(s).padStart(n);
const line = arr => arr.map((s, i) => pad(s, cols[i].w)).join(' ');

console.log();
console.log(line(cols.map(c => c.h)));
console.log('-'.repeat(cols.reduce((s, c) => s + c.w + 1, -1)));
for (const r of results) {
    console.log(line(cols.map(c => c.get(r) ?? '—')));
}
console.log();
console.log('init peak  = (heap + external) right after build, before forced GC');
console.log('init held  = (heap + external) after multi-pass forced GC');
console.log('heap held  = V8 heap delta only (subset of held)');
console.log('ext held   = off-heap delta (ArrayBuffer backing + other external; subset of held)');
console.log('drill held = held after init + getTile() drilldown sample');
console.log('deep       = geojsonvt(data, {indexMaxZoom: N, indexMaxPoints: 0})');
console.log();
console.log('All measurements use a warm-up build before baseline to settle V8 heap');
console.log('fragmentation left by JSON.parse. Data file read as utf8 string (no Buffer).');

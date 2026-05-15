// Memory + speed benchmark for geojson-vt.
//
// Run:  npm run bench
//   or: node --expose-gc bench/bench.js [dataset1 dataset2 ...]
//
// Reports per dataset, two phases:
//
//   init   — geojsonvt(data, {})                  default options
//   deep   — geojsonvt(data, {indexMaxZoom, indexMaxPoints: 0})
//
// Methodology:
//
//   1. PER-DATASET CHILD PROCESS. Each dataset runs in a fresh `node`
//      so prior dataset state can't pollute the baseline.
//
//   2. PEAK FROM GCProfiler.
//      Naïve heap_used / committed-pages / RSS snapshots all fail in
//      different ways (GC schedule, V8 page-chunk granularity, kernel
//      RSS lag). Instead we use `v8.GCProfiler`, which captures every
//      major-GC event during the build along with the heap state
//      before and after each GC. From that we derive:
//        - `alloc` = held + Σ(bytes freed by each GC)
//                    True total bytes allocated by the build, including
//                    everything that was created and freed. This is the
//                    metric for "did we make a lot of trash?"
//        - `peak`  = max(usedHeapSize-before-GC) across all GCs.
//                    The actual in-build heap high-water mark. This is
//                    the metric for "could a constrained device OOM?"
//      Both are GC-schedule-immune: re-running a build with different
//      GC timing produces nearly identical alloc/peak numbers because
//      we sum across GCs rather than relying on a single snapshot.
//
//   3. HELD = heap + external after multi-pass forced GC.
//      Retained state. `heapUsed` alone misses ArrayBuffer backing.
//
//   4. WARMUP build before each phase. JSON.parse leaves V8 fragmented;
//      one throwaway build settles it.
//
// Numbers aren't directly comparable across machines but ARE comparable
// across geojson-vt versions on the same machine.

import {readFileSync, existsSync} from 'fs';
import {performance} from 'perf_hooks';
import {spawn} from 'child_process';
import {fileURLToPath} from 'url';
import v8 from 'v8';
import GeoJSONVT from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);

const DATASETS = [
    {name: 'earthquakes', file: 'debug/data/earthquakes.json',           note: 'points',          deep: {indexMaxZoom: 10, indexMaxPoints: 0}},
    {name: 'places',      file: 'debug/data/ne_10m_populated_places_simple.json', note: 'points (7k)', deep: {indexMaxZoom: 10, indexMaxPoints: 0}},
    {name: 'route',       file: 'debug/data/route.json',                 note: 'linestring',      deep: {indexMaxZoom: 12, indexMaxPoints: 0}},
    {name: 'hrr',         file: 'debug/data/hrr.json',                   note: 'polygons',        deep: {indexMaxZoom: 8,  indexMaxPoints: 0}},
    {name: 'us-2010',     file: 'debug/data/gz_2010_us_050_00_500k.json', note: 'polygons (22M)', deep: {indexMaxZoom: 7,  indexMaxPoints: 0}},
    {name: 'county',      file: 'debug/data/county.json',                note: 'polygons (205M)', deep: null}
];

if (process.argv.includes('--single')) {
    if (!global.gc) { console.error('child needs --expose-gc'); process.exit(2); }
    const name = process.argv[process.argv.indexOf('--single') + 1];
    const ds = DATASETS.find(d => d.name === name);
    if (!ds) { console.error(`unknown dataset: ${name}`); process.exit(2); }
    try {
        const r = runOne(ds);
        process.stdout.write(JSON.stringify(r) + '\n');
    } catch (e) {
        process.stdout.write(JSON.stringify({name: ds.name, error: e.message}) + '\n');
        process.exit(1);
    }
} else {
    const wantNames = process.argv.slice(2).filter(a => !a.startsWith('-'));
    const datasets = (wantNames.length ? DATASETS.filter(d => wantNames.includes(d.name)) : DATASETS)
        .filter(d => {
            const ok = existsSync(new URL('../' + d.file, import.meta.url));
            if (!ok) console.error(`skipping ${d.name}: ${d.file} not found`);
            return ok;
        });

    const results = [];
    for (const ds of datasets) {
        process.stderr.write(`${ds.name}… `);
        const r = await spawnChild(ds.name);
        results.push(r);
        process.stderr.write(r.error ? `error: ${r.error}\n` : 'done\n');
    }
    printTable(results);
}

// ──────────────────────────── child ───────────────────────────────

function settle() { for (let i = 0; i < 8; i++) global.gc(); }

function snap() {
    const m = process.memoryUsage();
    return {heap: m.heapUsed, ext: m.external, total: m.heapUsed + m.external};
}

// Measure one build of `geojsonvt(data, opts)` using `v8.GCProfiler`:
//   - `alloc` total bytes allocated (held + Σ freed during build)
//   - `peak`  in-build heap high-water mark (max before-GC heap_used, or
//             post-build heap_used if no GC fired)
//   - `held`  retained heap+ext after multi-pass forced GC
//   - `ms`    build time
//
// GCProfiler.start/stop captures every GC that completes within the window
// (in current Node, both scavenges and major GCs). Across runs, GC trigger
// points jitter — sometimes a GC straddles the stop boundary and isn't
// fully captured, which undercounts `freed`. So we run N iterations and
// take the max: missed GCs only undercount, so max is closest to truth.
// Median ms (peak/held don't drift across iterations so max is fine).
function measureBuild(data, opts, baseline, iterations) {
    const samples = [];
    for (let i = 0; i < iterations; i++) {
        const prof = new v8.GCProfiler();
        prof.start();
        const t0 = performance.now();
        const idx = new GeoJSONVT(data, opts);
        const ms = performance.now() - t0;
        const result = prof.stop();
        const postBuild = snap();
        settle();
        const heldSnap = snap();

        let freed = 0;
        let peakHeap = postBuild.heap;
        for (const e of result.statistics) {
            const before = e.beforeGC.heapStatistics.usedHeapSize;
            const after  = e.afterGC.heapStatistics.usedHeapSize;
            if (before > after) freed += before - after;
            if (before > peakHeap) peakHeap = before;
        }

        samples.push({
            ms,
            alloc: (heldSnap.total - baseline.total) + freed,
            peak: peakHeap + postBuild.ext - baseline.total,
            held: heldSnap.total - baseline.total,
            gcCount: result.statistics.length,
            index: i === iterations - 1 ? idx : null
        });
        void idx;
        settle();
    }
    const max = key => Math.max(...samples.map(s => s[key]));
    const median = key => {
        const sorted = [...samples].map(s => s[key]).sort((a, b) => a - b);
        return sorted[sorted.length >> 1];
    };
    return {
        ms: median('ms'),
        alloc: max('alloc'),
        peak: max('peak'),
        held: median('held'),
        gcCount: max('gcCount'),
        index: samples[samples.length - 1].index
    };
}

function runOne(ds) {
    const data = JSON.parse(readFileSync(new URL('../' + ds.file, import.meta.url), 'utf8'));
    const ITER = 3;

    // ─── init phase
    void new GeoJSONVT(data, {});
    settle();
    const initBase = snap();
    const init = measureBuild(data, {}, initBase, ITER);
    let idx = init.index; void idx; idx = null;
    settle();

    // ─── deep phase
    let deep = null;
    if (ds.deep) {
        void new GeoJSONVT(data, ds.deep);
        settle();
        const dBase = snap();
        const d = measureBuild(data, ds.deep, dBase, ITER);
        deep = {ms: d.ms, alloc: d.alloc, peak: d.peak, held: d.held, opts: ds.deep};
        void d.index;
    }

    return {
        name: ds.name,
        note: ds.note,
        init: {ms: init.ms, alloc: init.alloc, peak: init.peak, held: init.held},
        deep
    };
}

// ──────────────────────────── parent ──────────────────────────────

function spawnChild(name) {
    return new Promise((resolve) => {
        const args = [
            '--expose-gc',
            '--max-old-space-size=8192',
            __filename,
            '--single', name
        ];
        const child = spawn(process.execPath, args, {stdio: ['ignore', 'pipe', 'inherit']});
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.on('close', (code) => {
            const line = out.trim().split('\n').pop();
            try { resolve(JSON.parse(line)); }
            catch (e) { resolve({name, error: `bad child output (code=${code}): ${e.message}`}); }
        });
    });
}

function kb(b)    { return Math.round(b / 1024); }
function fmtKB(b) { return b == null ? '—' : `${kb(b)} KB`; }
function fmtMs(t) { return t == null ? '—' : t.toFixed(1); }

function printTable(results) {
    const cols = [
        {h: 'dataset',     w: 12, get: r => r.name},
        {h: 'init ms',     w:  9, get: r => fmtMs(r.init?.ms)},
        {h: 'init alloc',  w: 11, get: r => fmtKB(r.init?.alloc)},
        {h: 'init peak',   w: 11, get: r => fmtKB(r.init?.peak)},
        {h: 'init held',   w: 11, get: r => fmtKB(r.init?.held)},
        {h: 'deep ms',     w:  9, get: r => fmtMs(r.deep?.ms)},
        {h: 'deep alloc',  w: 11, get: r => fmtKB(r.deep?.alloc)},
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
    console.log('alloc = held + Σ(bytes freed by GC during build) — true total bytes allocated');
    console.log('peak  = max heap_used right before any in-build GC (or post-build if no GC fired)');
    console.log('held  = (heap + external) after multi-pass forced GC');
    console.log('deep  = geojsonvt(data, {indexMaxZoom: N, indexMaxPoints: 0})');
}

// Memory + speed benchmark for geojson-vt.
//
// Run:  npm run bench
//   or: node --expose-gc bench/bench.js [dataset1 dataset2 ...]
//
// Two phases per dataset:
//   init  — new GeoJSONVT(data, {})
//   deep  — new GeoJSONVT(data, {indexMaxZoom: 10, indexMaxPoints: 1000})
//
// `deep` is a realistic "pre-tile more aggressively" config: deeper indexing into dense areas,
// but `indexMaxPoints` still bounds it so sparse regions stop early. Use `indexMaxPoints: 0`
// for full every-tile pre-tiling (stress test, not a real workload).
//
// Columns per phase:
//   ms     median build time
//   alloc  held + Σ(bytes freed by GC during build) — total allocation
//   peak   max usedHeapSize before any in-build GC (proxy for high-water mark)
//   held   heap + external after multi-pass forced GC
//
// `alloc` and `peak` come from `v8.GCProfiler` rather than snapshots — naïve heap_used/RSS
// sampling misses GCs and underreports both. Some GCs near measurement boundaries are still
// missed, so we take 3 iterations and report max for alloc/peak (missed GCs only undercount).
//
// Each dataset runs in its own `node --expose-gc` child for a clean baseline. A warmup build
// before measurement stabilizes the heap after JSON.parse fragmentation. Numbers aren't
// comparable across machines, but are stable across geojson-vt versions on the same machine.

/* eslint no-void: 0, no-await-in-loop: 0 */

import {readFileSync, existsSync} from 'fs';
import {performance} from 'perf_hooks';
import {spawn} from 'child_process';
import {fileURLToPath} from 'url';
import v8 from 'v8';
import GeoJSONVT from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);

const DEEP_OPTS = {indexMaxZoom: 10, indexMaxPoints: 1000};

const DATASETS = [
    {name: 'earthquakes', file: 'debug/data/earthquakes.json'},
    {name: 'places',      file: 'debug/data/ne_10m_populated_places_simple.json'},
    {name: 'route',       file: 'debug/data/route.json'},
    {name: 'hrr',         file: 'debug/data/hrr.json'},
    {name: 'us-2010',     file: 'debug/data/gz_2010_us_050_00_500k.json'},
    {name: 'county',      file: 'debug/data/county.json'}
];

const ITER = 3;

if (process.argv.includes('--single')) {
    if (!global.gc) { console.error('child needs --expose-gc'); process.exit(2); }
    const name = process.argv[process.argv.indexOf('--single') + 1];
    const ds = DATASETS.find(d => d.name === name);
    if (!ds) { console.error(`unknown dataset: ${name}`); process.exit(2); }
    try {
        process.stdout.write(`${JSON.stringify(runOne(ds))}\n`);
    } catch (e) {
        process.stdout.write(`${JSON.stringify({name: ds.name, error: e.message})}\n`);
        process.exit(1);
    }
} else {
    const want = new Set(process.argv.slice(2).filter(a => !a.startsWith('-')));
    const datasets = DATASETS.filter((d) => {
        if (want.size && !want.has(d.name)) return false;
        const ok = existsSync(new URL(`../${d.file}`, import.meta.url));
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
function snap() { const m = process.memoryUsage(); return m.heapUsed + m.external; }

function measureBuild(data, opts, baseline) {
    const samples = [];
    for (let i = 0; i < ITER; i++) {
        const prof = new v8.GCProfiler();
        prof.start();
        const t0 = performance.now();
        const idx = new GeoJSONVT(data, opts);
        const ms = performance.now() - t0;
        const stats = prof.stop().statistics;
        const postHeap = process.memoryUsage().heapUsed;
        const postExt = process.memoryUsage().external;
        settle();
        const held = snap() - baseline;

        let freed = 0;
        let peakHeap = postHeap;
        for (const e of stats) {
            const before = e.beforeGC.heapStatistics.usedHeapSize;
            const after  = e.afterGC.heapStatistics.usedHeapSize;
            if (before > after) freed += before - after;
            if (before > peakHeap) peakHeap = before;
        }

        samples.push({ms, alloc: held + freed, peak: peakHeap + postExt - baseline, held});
        void idx;
        settle();
    }
    const max = key => Math.max(...samples.map(s => s[key]));
    const median = (key) => {
        const sorted = samples.map(s => s[key]).sort((a, b) => a - b);
        return sorted[sorted.length >> 1];
    };
    return {ms: median('ms'), alloc: max('alloc'), peak: max('peak'), held: median('held')};
}

function runOne(ds) {
    const data = JSON.parse(readFileSync(new URL(`../${ds.file}`, import.meta.url), 'utf8'));

    void new GeoJSONVT(data, {}); // warmup
    settle();
    const init = measureBuild(data, {}, snap());

    void new GeoJSONVT(data, DEEP_OPTS);
    settle();
    const deep = measureBuild(data, DEEP_OPTS, snap());
    return {name: ds.name, init, deep};
}

// ──────────────────────────── parent ──────────────────────────────

function spawnChild(name) {
    return new Promise((resolve) => {
        const args = ['--expose-gc', '--max-old-space-size=8192', __filename, '--single', name];
        const child = spawn(process.execPath, args, {stdio: ['ignore', 'pipe', 'inherit']});
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.on('close', (code) => {
            const line = out.trim().split('\n').pop();
            try { resolve(JSON.parse(line)); } catch (e) { resolve({name, error: `bad child output (code=${code}): ${e.message}`}); }
        });
    });
}

function fmtBytes(b) {
    if (b == null) return '—';
    const mb = b / (1024 * 1024);
    if (mb < 1)   return `${(b / 1024).toFixed(0)} KB`;
    if (mb < 100) return `${mb.toFixed(1)} MB`;
    return `${mb.toFixed(0)} MB`;
}
function fmtMs(t) { return t == null ? '—' : t.toFixed(1); }

function printTable(results) {
    const cols = [
        {h: 'dataset',    w: 12, get: r => r.name},
        {h: 'init ms',    w: 9,  get: r => fmtMs(r.init?.ms)},
        {h: 'init alloc', w: 11, get: r => fmtBytes(r.init?.alloc)},
        {h: 'init peak',  w: 11, get: r => fmtBytes(r.init?.peak)},
        {h: 'init held',  w: 11, get: r => fmtBytes(r.init?.held)},
        {h: 'deep ms',    w: 9,  get: r => fmtMs(r.deep?.ms)},
        {h: 'deep alloc', w: 11, get: r => fmtBytes(r.deep?.alloc)},
        {h: 'deep peak',  w: 11, get: r => fmtBytes(r.deep?.peak)},
        {h: 'deep held',  w: 11, get: r => fmtBytes(r.deep?.held)}
    ];
    const pad = (s, n) => String(s).padStart(n);
    const row = arr => arr.map((s, i) => pad(s, cols[i].w)).join(' ');

    console.log();
    console.log(row(cols.map(c => c.h)));
    console.log('-'.repeat(cols.reduce((s, c) => s + c.w + 1, -1)));
    for (const r of results) console.log(row(cols.map(c => c.get(r) ?? '—')));
    console.log();
    console.log(`deep  = new GeoJSONVT(data, {indexMaxZoom: ${DEEP_OPTS.indexMaxZoom}, indexMaxPoints: ${DEEP_OPTS.indexMaxPoints}})`);
    console.log('alloc = held + Σ(bytes freed by GC during build)');
    console.log('peak  = max usedHeapSize before any in-build GC');
    console.log('held  = heap + external after multi-pass forced GC');
}

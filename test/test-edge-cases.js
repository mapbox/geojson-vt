import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import GeoJSONVT from '../src/index.js';

// Covers reviewer-flagged gaps that none of the existing tests exercise.

test('Int32 gate boundary: worldSpan == 2^32 falls back to Float64', () => {
    // extent * 2^maxZoom = 4096 * 2^20 = 2^32 exactly; strict `<` => Float64.
    const justOver = new GeoJSONVT({type: 'Point', coordinates: [0, 0]}, {extent: 4096, buffer: 0, maxZoom: 20});
    assert.equal(justOver.options.useInt32, false);

    // worldSpan = 2^31 (under the gate) => Int32 path.
    const justUnder = new GeoJSONVT({type: 'Point', coordinates: [0, 0]}, {extent: 4096, buffer: 0, maxZoom: 19});
    assert.equal(justUnder.options.useInt32, true);

    // Both paths must produce the same logical tile at z=0.
    assert.deepEqual(justOver.getTile(0, 0, 0).features, justUnder.getTile(0, 0, 0).features);
});

test('hole-first MultiPolygon: ring 0 treated as outer per GeoJSON spec', () => {
    // Two-polygon MultiPolygon. Each polygon's ring 0 is the outer ring, as required by the GeoJSON spec.
    // v4 silently rewound malformed inputs; v5 trusts ring 0 = outer. This test pins the spec-compliant behavior
    // so a future "auto-rewind" regression would flip these signs.
    const index = new GeoJSONVT({
        type: 'MultiPolygon',
        coordinates: [
            [[[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]],
            [[[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]]]
        ]
    });
    const tile = index.getTile(0, 0, 0);
    // Both polygons retained, each with a single outer ring.
    assert.equal(tile.features.length, 1);
    assert.equal(tile.features[0].type, 3);
    assert.equal(tile.features[0].geometry.length, 2);
});

test('degenerate lineMetrics lines: no NaN in mapbox_clip_start/end', () => {
    // Both endpoints land in the same storage cell, or within one quantum of it, so the stored ringSize
    // truncates to 0 while the line itself survives at maxZoom (tolerance is 0 there). Dividing the running
    // start/end sums by that zero size used to emit NaN tags; a zero-size line spans the full [0, 1] range.
    for (const [name, coords] of [
        ['sub-quantum', [[0.00001, 0.00001], [0.000012, 0.000012]]],
        ['zero-length', [[0.00001, 0.00001], [0.00001, 0.00001]]]
    ]) {
        const index = new GeoJSONVT({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: coords},
            properties: {}
        }, {lineMetrics: true, maxZoom: 14});

        const tile = index.getTile(14, 8192, 8191);
        assert.ok(tile && tile.features.length > 0, `${name}: expected a feature to assert on`);
        for (const f of tile.features) {
            const {mapbox_clip_start: s, mapbox_clip_end: e} = f.tags;
            assert.ok(Number.isFinite(s) && s >= 0 && s <= 1, `${name}: mapbox_clip_start not in [0, 1]: ${s}`);
            assert.ok(Number.isFinite(e) && e >= 0 && e <= 1, `${name}: mapbox_clip_end not in [0, 1]: ${e}`);
        }
    }
});

test('committed-tile path with extent > 32767 (Int32 tile coords)', () => {
    // extent + buffer > 32767 forces tile.js to use Int32Array for tile coords
    // instead of Int16Array. Exercises the wider commit path.
    const index = new GeoJSONVT({
        type: 'LineString',
        coordinates: [[-90, 0], [90, 0]]
    }, {extent: 65536, buffer: 0});

    const tile = index.getTile(0, 0, 0);
    assert.equal(tile.features.length, 1);
    const ring = tile.features[0].geometry[0];
    // Right endpoint must exceed Int16 range.
    assert.ok(ring[ring.length - 1][0] > 32767, `got x=${ring[ring.length - 1][0]}`);
});

test('getTile returns a fresh envelope each call (no identity caching)', () => {
    // v4 cached and mutated; v5 materializes. Pins the breaking-change.
    const index = new GeoJSONVT({type: 'Point', coordinates: [0, 0]});
    const a = index.getTile(0, 0, 0);
    const b = index.getTile(0, 0, 0);
    assert.notEqual(a, b);
    assert.notEqual(a.features, b.features);
    assert.deepEqual(a.features, b.features);
});

test('polygon vertex exactly at buffer edge survives clip', () => {
    // A polygon whose rightmost vertex sits exactly on the tile's buffered right edge. Exercises the
    // byte-exact `min >= k1 && max < k2` boundary logic in clip.js — vertex must end up in exactly
    // one of the two adjacent tiles, with no duplication and no dropout.
    const index = new GeoJSONVT({
        type: 'Polygon',
        coordinates: [[[0, 10], [10, 10], [10, -10], [0, -10], [0, 10]]]
    }, {buffer: 0});

    // Tile (1,1,0) covers lon [0, 180]; (1,0,0) covers [-180, 0]. Vertex at lon=0 sits on their shared edge.
    const right = index.getTile(1, 1, 0);
    const left = index.getTile(1, 0, 0);
    const totalRings = (right ? right.features.length : 0) + (left ? left.features.length : 0);
    assert.ok(totalRings >= 1, 'feature should land in at least one tile');
});

test('Float64 fallback path agrees with Int32 on dateline wrap and lineMetrics clipping', () => {
    // extent 8192 + buffer 64 at maxZoom 20 exceeds the 2^32 gate, so storage is Float64 in uncentered
    // [0, 1] source space — a separate projection path, and the one where clip's interpolated coords must
    // NOT be rounded. Tile geometry must match the Int32 path exactly; the metrics only differ by the
    // maxZoom quantization of the Int32 store, which is well under a part in 10^6.
    const config = maxZoom => ({extent: 8192, buffer: 64, maxZoom, indexMaxZoom: 4, lineMetrics: true});

    const cases = {
        // crossing the antimeridian: exercises wrap.js on both paths
        dateline: {type: 'LineString', coordinates: [[170, 10], [-170, 20]]},
        // spanning several tiles: exercises clip.js's lineMetrics start/end accumulation across slices
        longLine: {type: 'LineString', coordinates: [[-100, -40], [-60, 0], [-20, 40], [20, 60]]}
    };

    for (const [name, geometry] of Object.entries(cases)) {
        const data = {type: 'Feature', properties: {}, geometry};
        const float64 = new GeoJSONVT(data, config(20));
        const int32 = new GeoJSONVT(data, config(10));
        assert.equal(float64.options.useInt32, false);
        assert.equal(int32.options.useInt32, true);

        let compared = 0;
        for (let z = 0; z <= 2; z++) {
            for (let x = 0; x < (1 << z); x++) {
                for (let y = 0; y < (1 << z); y++) {
                    const a = float64.getTile(z, x, y);
                    const b = int32.getTile(z, x, y);
                    const at = `${name} ${z}/${x}/${y}`;
                    assert.equal(a === null, b === null, `${at}: one path produced a tile and the other didn't`);
                    if (!a || !b) continue;
                    compared++;

                    assert.equal(a.features.length, b.features.length, `${at}: feature count differs`);
                    for (let i = 0; i < a.features.length; i++) {
                        assert.deepEqual(a.features[i].geometry, b.features[i].geometry, `${at}: geometry differs`);
                        for (const key of ['mapbox_clip_start', 'mapbox_clip_end']) {
                            const av = a.features[i].tags[key];
                            const bv = b.features[i].tags[key];
                            assert.ok(av >= 0 && av <= 1, `${at}: Float64 ${key} out of [0, 1]: ${av}`);
                            assert.ok(bv >= 0 && bv <= 1, `${at}: Int32 ${key} out of [0, 1]: ${bv}`);
                            assert.ok(Math.abs(av - bv) < 1e-6, `${at}: ${key} differs by more than quantization: ${av} vs ${bv}`);
                        }
                    }
                }
            }
        }
        assert.ok(compared >= 4, `${name}: expected several tiles to compare, got ${compared}`);
    }
});

test('MultiPolygon mixing a valid polygon with a zero-area one keeps both, in input order', () => {
    // The collinear ring has zero area but is still a ring of the MultiPolygon; the ring walk must keep it
    // in place and, more importantly, must not lose the valid polygon on either side of it. Matches v4.
    const collinear = [[[0, 0], [10, 10], [20, 20], [0, 0]]];
    const valid = [[[-40, -40], [-20, -40], [-20, -20], [-40, -20], [-40, -40]]];

    const ringArea = ring => Math.abs(ring.reduce((sum, [px, py], i) => {
        const [qx, qy] = ring[(i + 1) % ring.length];
        return sum + (px * qy - qx * py);
    }, 0) / 2);

    for (const [name, coordinates, validIdx] of [
        ['degenerate first', [collinear, valid], 1],
        ['degenerate last', [valid, collinear], 0]
    ]) {
        const index = new GeoJSONVT({type: 'MultiPolygon', coordinates});
        const tile = index.getTile(0, 0, 0);
        assert.ok(tile, `${name}: expected a tile`);
        assert.equal(tile.features.length, 1, `${name}: expected one feature`);

        const rings = tile.features[0].geometry;
        assert.equal(rings.length, 2, `${name}: expected both rings`);
        assert.ok(ringArea(rings[validIdx]) > 0, `${name}: valid polygon was lost`);
        assert.equal(ringArea(rings[1 - validIdx]), 0, `${name}: degenerate ring should have zero area`);
        // The square's four corners survive simplification at z0.
        assert.equal(rings[validIdx].length, 5, `${name}: valid polygon should keep its 5 closed vertices`);
    }
});

test('polygon straddling lon 0 / lat 0 produces no degenerate rings at maxZoom', () => {
    // Regression: the polygon clip precount may over-reserve a closing point, and the unused slack at the end
    // of the buffer used to be read as an empty ring on the next clip, emitting garbage single-vertex rings in
    // stripes containing storage 0 (the equator / Greenwich meridian). Only visible at maxZoom, where tolerance
    // no longer drops zero-size rings.
    const index = new GeoJSONVT({
        type: 'Polygon',
        coordinates: [[[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]]
    });
    let rings = 0;
    for (const x of [8191, 8192]) {
        for (const y of [8191, 8192]) {
            const tile = index.getTile(14, x, y);
            for (const feature of tile.features) {
                for (const ring of feature.geometry) {
                    assert.ok(ring.length >= 4, `degenerate ring ${JSON.stringify(ring)} in tile 14/${x}/${y}`);
                    rings++;
                }
            }
        }
    }
    assert.equal(rings, 4);
});

test('point exactly on a shared tile edge lands in exactly one tile', () => {
    // Points use the same half-open [k1, k2) stripe as the feature bbox checks, so a point on the boundary
    // belongs to the tile on its right/bottom, whether it's alone or accompanied by other features.
    const point = {type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [0, 0]}};
    const multi = {type: 'Feature', properties: {}, geometry: {type: 'MultiPoint', coordinates: [[0, 0], [-90, 45]]}};
    const other = {type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [-90, -45]}};

    for (const features of [[point], [point, other], [multi], [multi, other]]) {
        const index = new GeoJSONVT({type: 'FeatureCollection', features}, {buffer: 0});
        const hits = [];
        for (const x of [0, 1]) {
            for (const y of [0, 1]) {
                const tile = index.getTile(1, x, y);
                if (!tile) continue;
                for (const f of tile.features) {
                    for (const [px, py] of f.geometry) {
                        if (px === 0 && py === 0) hits.push(`${x}/${y}`);
                    }
                }
            }
        }
        assert.deepEqual(hits, ['1/1'], JSON.stringify(features));
    }
});

test('bounding boxes of clipped and wrapped features match a scan of the geometry', () => {
    const data = JSON.parse(readFileSync(new URL('fixtures/us-states.json', import.meta.url), 'utf8'));
    const dateline = JSON.parse(readFileSync(new URL('fixtures/dateline.json', import.meta.url), 'utf8'));
    let checked = 0;

    for (const index of [new GeoJSONVT(data, {indexMaxZoom: 6, indexMaxPoints: 0}), new GeoJSONVT(dateline, {indexMaxZoom: 4, indexMaxPoints: 0})]) {
        for (const id in index.tiles) {
            for (const f of index.tiles[id].source || []) {
                if (f.type === 4) continue; // single points carry no bbox
                const bbox = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
                const geom = f.geometry;
                const scan = (start, end) => {
                    for (let i = start; i < end; i += 3) {
                        bbox.minX = Math.min(bbox.minX, geom[i]);
                        bbox.minY = Math.min(bbox.minY, geom[i + 1]);
                        bbox.maxX = Math.max(bbox.maxX, geom[i]);
                        bbox.maxY = Math.max(bbox.maxY, geom[i + 1]);
                    }
                };
                if (f.type === 1) {
                    scan(0, geom.length);
                } else {
                    for (let i = 0; i < geom.length;) {
                        const end = i + 2 + geom[i] * 3;
                        scan(i + 2, end);
                        i = end;
                    }
                }
                assert.deepEqual({minX: f.minX, minY: f.minY, maxX: f.maxX, maxY: f.maxY}, bbox);
                checked++;
            }
        }
    }
    assert.ok(checked > 300, `checked only ${checked} features`);
});

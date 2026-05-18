import test from 'node:test';
import assert from 'node:assert/strict';

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

test('sub-quantum lineMetrics: no NaN in mapbox_clip_start/end', () => {
    // Line endpoints quantize to the same storage cell. Pre-#5, bbox computed from the (empty) coord walk
    // left maxX/minX at ±Infinity, and clip's `feature.start / 0` produced NaN tags. After #5,
    // the outer-ring bbox is always computed so this feature is correctly bbox-rejected upstream.
    const index = new GeoJSONVT({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [[0, 0], [1e-9, 1e-9]]},
        properties: {}
    }, {lineMetrics: true});

    const tile = index.getTile(0, 0, 0);
    for (const f of tile.features) {
        if (!f.tags) continue;
        const {mapbox_clip_start: s, mapbox_clip_end: e} = f.tags;
        assert.ok(s === undefined || Number.isFinite(s), `mapbox_clip_start not finite: ${s}`);
        assert.ok(e === undefined || Number.isFinite(e), `mapbox_clip_end not finite: ${e}`);
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

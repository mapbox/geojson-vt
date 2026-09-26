
import test from 'node:test';
import assert from 'node:assert/strict';

import GeoJSONVT from '../src/index.js';

const leftPoint = {
    type: 'Feature',
    properties: {},
    geometry: {
        coordinates: [-540, 0],
        type: 'Point'
    }
};

const rightPoint = {
    type: 'Feature',
    properties: {},
    geometry: {
        coordinates: [540, 0],
        type: 'Point'
    }
};

// getTile returns extent-scaled integer tile coordinates; the z=0/extent=4096
// world maps x∈[0,1]→[0,4096] and the equator y=0.5→2048.

test('handle point only in the rightside world', () => {
    const vt = new GeoJSONVT(rightPoint);
    assert.deepEqual(vt.getTile(0, 0, 0).features[0].geometry, [[4096, 2048]]);
});

test('handle point only in the leftside world', () => {
    const vt = new GeoJSONVT(leftPoint);
    assert.deepEqual(vt.getTile(0, 0, 0).features[0].geometry, [[0, 2048]]);
});

test('handle points in the leftside world and the rightside world', () => {
    const vt = new GeoJSONVT({
        type: 'FeatureCollection',
        features: [leftPoint, rightPoint]
    });
    const features = vt.getTile(0, 0, 0).features;
    assert.deepEqual(features[0].geometry, [[0, 2048]]);
    assert.deepEqual(features[1].geometry, [[4096, 2048]]);
});

// mapbox-gl GeoJSONSource defaults: worldScale 2^31, so storage x fits Int32 only for lng in [-360, 360)
const glOptions = {extent: 8192, buffer: 2048, tolerance: 6, maxZoom: 18};

function tileLngs(vt, extent) {
    return vt.getTile(0, 0, 0).features.flatMap(f => f.geometry).map(r => r.map(p => Math.round(p[0] / extent * 360 - 180)));
}

// Float64 storage (the gate fails at maxZoom 19) as the reference; z0 tiles don't depend on maxZoom
function assertMatchesFloat64(geometry) {
    const vt = new GeoJSONVT(geometry, glOptions);
    assert.equal(vt.options.useInt32, true);
    const ref = new GeoJSONVT(geometry, {...glOptions, maxZoom: 19});
    assert.equal(ref.options.useInt32, false);
    assert.deepEqual(vt.getTile(0, 0, 0).features, ref.getTile(0, 0, 0).features);
}

test('handle features past lng ±360 with Int32 storage near its limit (#196)', () => {
    const line = {type: 'LineString', coordinates: [[170, 0], [250, 10], [330, 0], [350, 10], [390, 0]]};
    assert.deepEqual(tileLngs(new GeoJSONVT(line, glOptions), 8192), [[170, 250, 270], [-190, -110, -30, -10, 30]]);
    assert.deepEqual(tileLngs(new GeoJSONVT(line, {maxZoom: 19}), 4096), [[170, 186], [-186, -110, -30, -10, 30]]);

    assertMatchesFloat64(line);
    assertMatchesFloat64({type: 'LineString', coordinates: line.coordinates.map(([x, y]) => [-x, y])});
    assertMatchesFloat64({type: 'LineString', coordinates: [[-180, 0], [0, 10], [400, 0]]}); // no whole-world shift fits
    assertMatchesFloat64({type: 'Polygon', coordinates: [[[350, -10], [400, -10], [400, 10], [350, 10], [350, -10]]]});
    assertMatchesFloat64({type: 'MultiPoint', coordinates: [[370, 10], [400, -10]]});
    assertMatchesFloat64({type: 'GeometryCollection', geometries: [line, {type: 'Point', coordinates: [10, 10]}]});
});

test('simplify features past lng ±360 from their true coords (#196)', () => {
    const line = {type: 'LineString', coordinates: [[350, 0], [360, 0], [370, 0]]};
    assert.deepEqual(tileLngs(new GeoJSONVT(line, glOptions), 8192), [[-10, 10]]);
    assertMatchesFloat64(line);
});

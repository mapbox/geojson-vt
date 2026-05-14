
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

// Default extent 4096; equator wraps to y = 0.5 → 2048 in tile space.
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

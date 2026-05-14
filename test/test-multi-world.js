
import test from 'node:test';
import assert from 'node:assert/strict';

import geojsonvt from '../src/index.js';

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

// retained tiles store extent-scaled integer tile coordinates; the z=0/extent=4096
// world maps x∈[0,1]→[0,4096] and the equator y=0.5→2048.

test('handle point only in the rightside world', () => {
    const vt = geojsonvt(rightPoint);
    assert.equal(vt.tiles[0].features[0].geometry[0], 4096);
    assert.equal(vt.tiles[0].features[0].geometry[1], 2048);
});

test('handle point only in the leftside world', () => {
    const vt = geojsonvt(leftPoint);
    assert.equal(vt.tiles[0].features[0].geometry[0], 0);
    assert.equal(vt.tiles[0].features[0].geometry[1], 2048);
});

test('handle points in the leftside world and the rightside world', () => {
    const vt = geojsonvt({
        type: 'FeatureCollection',
        features: [leftPoint, rightPoint]
    });

    assert.equal(vt.tiles[0].features[0].geometry[0], 0);
    assert.equal(vt.tiles[0].features[0].geometry[1], 2048);

    assert.equal(vt.tiles[0].features[1].geometry[0], 4096);
    assert.equal(vt.tiles[0].features[1].geometry[1], 2048);
});

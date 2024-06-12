
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

test('handle point only in the rightside world', () => {
    try {
        const vt = geojsonvt(rightPoint);
        assert.equal(vt.tiles[0].features[0].geometry[0], 1);
        assert.equal(vt.tiles[0].features[0].geometry[1], .5);
    } catch (err) {
        assert.fail(err);
    }
});

test('handle point only in the leftside world', () => {
    try {
        const vt = geojsonvt(leftPoint);
        assert.equal(vt.tiles[0].features[0].geometry[0], 0);
        assert.equal(vt.tiles[0].features[0].geometry[1], .5);
    } catch (err) {
        assert.fail(err);
    }
});

test('handle points in the leftside world and the rightside world', () => {
    try {
        const vt = geojsonvt({
            type: 'FeatureCollection',
            features: [leftPoint, rightPoint]
        });

        assert.equal(vt.tiles[0].features[0].geometry[0], 0);
        assert.equal(vt.tiles[0].features[0].geometry[1], .5);

        assert.equal(vt.tiles[0].features[1].geometry[0], 1);
        assert.equal(vt.tiles[0].features[1].geometry[1], .5);
    } catch (err) {
        assert.fail(err);
    }
});

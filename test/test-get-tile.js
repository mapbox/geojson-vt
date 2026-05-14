
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

import geojsonvt from '../src/index.js';

const square = [{
    geometry: [[[-64, 4160], [-64, -64], [4160, -64], [4160, 4160], [-64, 4160]]],
    type: 3,
    tags: {name: 'Pennsylvania', density: 284.3},
    id: '42'
}];

test('getTile: us-states.json', () => {
    const log = console.log;

    console.log = function () {};
    const index = geojsonvt(getJSON('us-states.json'), {debug: 2});

    assert.deepEqual(index.getTile(7, 37, 48).features, getJSON('us-states-z7-37-48.json'), 'z7-37-48');
    assert.deepEqual(index.getTile('7', '37', '48').features, getJSON('us-states-z7-37-48.json'), 'z, x, y as strings');

    assert.deepEqual(index.getTile(9, 148, 192).features, square, 'z9-148-192 (clipped square)');

    assert.equal(index.getTile(11, 800, 400), null, 'non-existing tile');
    assert.equal(index.getTile(-5, 123.25, 400.25), null, 'invalid tile');
    assert.equal(index.getTile(25, 200, 200), null, 'invalid tile');

    console.log = log;

    assert.equal(index.total, 37);
});

test('getTile: unbuffered tile left/right edges', () => {
    const index = geojsonvt({
        type: 'LineString',
        coordinates: [[0, 90], [0, -90]]
    }, {
        buffer: 0
    });

    assert.deepEqual(index.getTile(2, 1, 1), null);
    assert.deepEqual(index.getTile(2, 2, 1).features, [{geometry: [[[0, 0], [0, 4096]]], type: 2, tags: null}]);
});

test('getTile: unbuffered tile top/bottom edges', () => {
    const index = geojsonvt({
        type: 'LineString',
        coordinates: [[-90, 66.51326044311188], [90, 66.51326044311188]]
    }, {
        buffer: 0
    });

    assert.deepEqual(index.getTile(2, 1, 0).features, [{geometry: [[[0, 4096], [4096, 4096]]], type: 2, tags: null}]);
    assert.deepEqual(index.getTile(2, 1, 1).features, []);
});

test('getTile: polygon clipping on the boundary', () => {
    const index = geojsonvt({
        type: 'Polygon',
        coordinates: [[
            [42.1875, 57.32652122521708],
            [47.8125, 57.32652122521708],
            [47.8125, 54.16243396806781],
            [42.1875, 54.16243396806781],
            [42.1875, 57.32652122521708]
        ]]
    }, {
        buffer: 1024
    });

    assert.deepEqual(index.getTile(5, 19, 9).features, [{
        geometry: [[[3072, 3072], [5120, 3072], [5120, 5120], [3072, 5120], [3072, 3072]]],
        type: 3,
        tags: null
    }]);
});

test('getTile: polygon with vertex exactly on tile boundary (#118)', () => {
    const index = geojsonvt({
        type: 'Polygon',
        coordinates: [[[-90, -90], [0, -90], [90, -90], [0, 0], [-90, -90]]]
    }, {indexMaxZoom: 0, maxZoom: 24, tolerance: 1.5, extent: 4096, buffer: 0});

    assert.deepEqual(index.getTile(1, 1, 1).features, [{
        geometry: [[[0, 0], [0, 0], [2048, 4096], [0, 4096], [0, 0]]],
        type: 3,
        tags: null
    }]);
});

test('getTile: polygon with collinear vertex on tile boundary (#161)', () => {
    const index = geojsonvt({
        type: 'Polygon',
        coordinates: [[
            [20, 34.365234375],
            [80, 4.34326171875],
            [45, 4.34326171875],
            [20, 4.34326171875],
            [20, 34.365234375]
        ]]
    }, {buffer: 0, maxZoom: 5});

    const tile = index.getTile(3, 4, 3);
    assert.deepEqual(tile.features, [{
        geometry: [[[1820, 762], [4096, 1986], [4096, 3700], [1820, 3700], [1820, 762]]],
        type: 3,
        tags: null
    }]);
});

test('getTile: line metrics with vertex on tile border (geojson-vt-cpp#92)', () => {
    const index = geojsonvt({
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: [
                [-77.031373697916663, 38.895516493055553],
                [-77.01416015625, 38.887532552083336],
                [-76.99, 38.87]
            ]
        }
    }, {lineMetrics: true, buffer: 2048, extent: 8192, maxZoom: 14});

    const tile = index.getTile(13, 2344, 3134);
    assert.equal(tile.features.length, 1);
    assert.deepEqual(tile.features[0].geometry, [[[-2048, 2747], [408, 5037]]]);
    assert.ok(Math.abs(tile.features[0].tags.mapbox_clip_start - 0.660622) < 1e-5);
    assert.equal(tile.features[0].tags.mapbox_clip_end, 1);
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
}

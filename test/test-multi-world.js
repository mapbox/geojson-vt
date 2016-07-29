'use strict';

var test = require('tape');
var geojsonvt = require('../src/index');

var leftPoint = {
    type: 'Feature',
    properties: {},
    geometry: {
        coordinates: [-540, 0],
        type: 'Point'
    }
};

var rightPoint = {
    type: 'Feature',
    properties: {},
    geometry: {
        coordinates: [540, 0],
        type: 'Point'
    }
};

test('handle point only in the rightside world', function (t) {
    try {
        var vt = geojsonvt(rightPoint);
        t.equal(vt.tiles[0].features[0].geometry[0][0], 1);
        t.equal(vt.tiles[0].features[0].geometry[0][1], .5);
    } catch (err) {
        t.ifError(err);
    }
    t.end();
});

test('handle point only in the leftside world', function (t) {
    try {
        var vt = geojsonvt(leftPoint);
        t.equal(vt.tiles[0].features[0].geometry[0][0], 0);
        t.equal(vt.tiles[0].features[0].geometry[0][1], .5);
    } catch (err) {
        t.ifError(err);
    }
    t.end();
});

test('handle points in the leftside world and the rightside world', function (t) {
    try {
        var vt = geojsonvt({
            type: 'FeatureCollection',
            features: [leftPoint, rightPoint]
        });

        t.equal(vt.tiles[0].features[0].geometry[0][0], 0);
        t.equal(vt.tiles[0].features[0].geometry[0][1], .5);

        t.equal(vt.tiles[0].features[1].geometry[0][0], 1);
        t.equal(vt.tiles[0].features[1].geometry[0][1], .5);
    } catch (err) {
        t.ifError(err);
    }
    t.end();
});

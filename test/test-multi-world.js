
import test from 'tape';
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

test('handle point only in the rightside world', (t) => {
    try {
        const vt = geojsonvt(rightPoint);
        t.equal(vt.tiles[0].features[0].geometry[0], 1);
        t.equal(vt.tiles[0].features[0].geometry[1], .5);
    } catch (err) {
        t.ifError(err);
    }
    t.end();
});

test('handle point only in the leftside world', (t) => {
    try {
        const vt = geojsonvt(leftPoint);
        t.equal(vt.tiles[0].features[0].geometry[0], 0);
        t.equal(vt.tiles[0].features[0].geometry[1], .5);
    } catch (err) {
        t.ifError(err);
    }
    t.end();
});

test('handle points in the leftside world and the rightside world', (t) => {
    try {
        const vt = geojsonvt({
            type: 'FeatureCollection',
            features: [leftPoint, rightPoint]
        });

        t.equal(vt.tiles[0].features[0].geometry[0], 0);
        t.equal(vt.tiles[0].features[0].geometry[1], .5);

        t.equal(vt.tiles[0].features[1].geometry[0], 1);
        t.equal(vt.tiles[0].features[1].geometry[1], .5);
    } catch (err) {
        t.ifError(err);
    }
    t.end();
});

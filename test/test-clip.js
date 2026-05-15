
import test from 'node:test';
import assert from 'node:assert/strict';

import clip from '../src/clip.js';
import {POINT, LINE, POLYGON} from '../src/feature.js';

/*eslint @stylistic/comma-spacing:0*/

const geom1 = [0,0,0,50,0,0,50,10,0,20,10,0,20,20,0,30,20,0,30,30,0,50,30,0,50,40,0,25,40,0,25,50,0,0,50,0,0,60,0,25,60,0];
const geom2 = [0,0,0,50,0,0,50,10,0,0,10,0];

// Build an inline-header geometry from one or more flat rings.
function lineGeom(...rings) {
    const out = [];
    for (const ring of rings) {
        let size = 0;
        for (let i = 0; i < ring.length - 3; i += 3) {
            const dx = ring[i + 3] - ring[i];
            const dy = ring[i + 4] - ring[i + 1];
            size += Math.sqrt(dx * dx + dy * dy);
        }
        out.push(ring.length / 3, size, ...ring);
    }
    return out;
}

function polyGeom(...rings) {
    const out = [];
    for (const ring of rings) {
        let area = 0;
        for (let i = 0; i < ring.length - 3; i += 3) {
            area += (ring[i] * ring[i + 4] - ring[i + 3] * ring[i + 1]) / 2;
        }
        out.push(ring.length / 3, area, ...ring);
    }
    return out;
}

test('clips polylines', () => {

    const clipped = clip([
        {geometry: lineGeom(geom1), type: LINE, tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: lineGeom(geom2), type: LINE, tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    const g1size = lineGeom(geom1)[1];
    const g2size = lineGeom(geom2)[1];
    const expected = [
        {id: null, type: LINE, geometry: [
            2, g1size, 10,0,1,40,0,1,
            6, g1size, 40,10,1,20,10,0,20,20,0,30,20,0,30,30,0,40,30,1,
            4, g1size, 40,40,1,25,40,0,25,50,0,10,50,1,
            2, g1size, 10,60,1,25,60,0], tags: 1, minX: 10, minY: 0, maxX: 40, maxY: 60},
        {id: null, type: LINE, geometry: [
            2, g2size, 10,0,1,40,0,1,
            2, g2size, 40,10,1,10,10,1], tags: 2, minX: 10, minY: 0, maxX: 40, maxY: 10}
    ];

    assert.equal(JSON.stringify(clipped), JSON.stringify(expected));
});

test('clips lines with line metrics on', () => {

    const geom = lineGeom(geom1);
    const size = geom[1];

    const feature = {geometry: geom, type: LINE, tags: null, start: 0, end: size, minX: 0, minY: 0, maxX: 50, maxY: 60};
    const clipped = clip([feature], 1, 10, 40, 0, -Infinity, Infinity, {lineMetrics: true});

    assert.deepEqual(
        clipped.map(f => [f.start, f.end]),
        [[10, 40], [70, 130], [160, 200], [230, 245]]
    );
});

function closed(geometry) {
    return geometry.concat(geometry.slice(0, 3));
}

test('clips polygons', () => {

    const ring1 = closed(geom1);
    const ring2 = closed(geom2);

    const clipped = clip([
        {geometry: polyGeom(ring1), type: POLYGON, tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: polyGeom(ring2), type: POLYGON, tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    const g1size = polyGeom(ring1)[1];
    const g2size = polyGeom(ring2)[1];
    const expected = [
        {id: null, type: POLYGON, geometry: [
            16, g1size, 10,0,1,40,0,1,40,10,1,20,10,0,20,20,0,30,20,0,30,30,0,40,30,1,40,40,1,25,40,0,25,50,0,10,50,1,10,60,1,25,60,0,10,24,1,10,0,1],
        tags: 1, minX: 10, minY: 0, maxX: 40, maxY: 60},
        {id: null, type: POLYGON, geometry: [
            5, g2size, 10,0,1,40,0,1,40,10,1,10,10,1,10,0,1],
        tags: 2,  minX: 10, minY: 0, maxX: 40, maxY: 10}
    ];

    assert.equal(JSON.stringify(clipped), JSON.stringify(expected));
});

test('clips points', () => {

    const clipped = clip([
        {geometry: geom1, type: POINT, tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: geom2, type: POINT, tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    assert.deepEqual(clipped, [{id: null, type: POINT,
        geometry: [20,10,0,20,20,0,30,20,0,30,30,0,25,40,0,25,50,0,25,60,0], tags: 1, minX: 20, minY: 10, maxX: 30, maxY: 60}]);
});


import test from 'tape';
import clip from '../src/clip.js';

/*eslint comma-spacing:0*/

const geom1 = [
    0,0,0,
    50,0,50,
    50,10,0,
    20,10,30,
    20,20,30,
    30,20,0,
    30,30,0,
    50,30,0,
    50,40,0,
    25,40,0,
    25,50,0,
    0,50,0,
    0,60,0,
    25,60,0];
const geom2 = [0,0,0,50,0,0,50,10,0,0,10,0];

test.skip('clips polylines', (t) => {

    const geometry1 = geom1.slice();
    const sqDist1 = new Array(geometry1.length / 3).fill(0);
    const geometry2 = geom2.slice();
    const sqDist2 = new Array(geometry2.length / 3).fill(0);
    const clipped = clip([
        {geometry: geometry1, sqDist: sqDist1, type: 'LineString', tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: geometry2, sqDist: sqDist2, type: 'LineString', tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    const expected = [
        {id: null, type: 'MultiLineString',geometry: [
            [10,0,10,40,0,40],
            [40,10,0,20,10,0,20,20,0,30,20,0,30,30,0,40,30,0],
            [40,40,0,25,40,0,25,50,0,10,50,0],
            [10,60,0,25,60,0]],
        sqDist: [
            [1,1],
            [1,0,0,0,0,1],
            [1,0,0,1],
            [1,1]], tags: 1, minX: 10, minY: 0, maxX: 40, maxY: 60},
        {id: null, type: 'MultiLineString', geometry: [
            [10,0,0,40,0,0],
            [40,10,0,10,10,0]], sqDist: [[1,1],[1,1]], tags: 2, minX: 10, minY: 0, maxX: 40, maxY: 10}
    ];

    t.equal(JSON.stringify(clipped), JSON.stringify(expected));

    t.end();
});

test('clips lines with line metrics on', (t) => {

    const geom = geom1.slice();
    geom.size = 0;
    const sqDist = new Array(geom.length / 3).fill(0);
    for (let i = 0; i < geom.length - 3; i += 3) {
        const dx = geom[i + 3] - geom[i];
        const dy = geom[i + 4] - geom[i + 1];
        geom.size += Math.sqrt(dx * dx + dy * dy);
    }
    geom.start = 0;
    geom.end = geom.size;

    const clipped = clip([{geometry: geom, sqDist, type: 'LineString', minX: 0, minY: 0, maxX: 50, maxY: 60}],
        1, 10, 40, 0, -Infinity, Infinity, {lineMetrics: true});

    t.same(
        clipped.map(f => [f.geometry.start, f.geometry.end]),
        [[10, 40], [70, 130], [160, 200], [230, 245]]
    );

    t.end();
});

function closed(geometry) {
    return [geometry.concat(geometry.slice(0, 3))];
}

test('clips polygons', (t) => {
    const geometry1 = closed(geom1);
    const sqDist1 = [new Array(geometry1[0].length / 3).fill(0)];

    const geometry2 = closed(geom2);
    const sqDist2 = [new Array(geometry2[0].length / 3).fill(0)];

    const clipped = clip([
        {geometry: geometry1, sqDist: sqDist1, type: 'Polygon', tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: geometry2, sqDist: sqDist2, type: 'Polygon', tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    const expected = [
        {id: null, type: 'Polygon', geometry: [[
            10,0,10,
            40,0,40,
            40,10,10,
            20,10,30,
            20,20,30,
            30,20,0,
            30,30,0,
            40,30,0,
            40,40,0,
            25,40,0,
            25,50,0,
            10,50,0,
            10,60,0,
            25,60,0,
            10,24,0,
            10,0,10]],
        sqDist: [[1,1,1,0,0,0,0,1,1,0,0,1,1,0,1,1]], tags: 1, minX: 10, minY: 0, maxX: 40, maxY: 60},
        {id: null, type: 'Polygon', geometry: [[
            10,0,0,
            40,0,0,
            40,10,0,
            10,10,0,
            10,0,0]],
        sqDist: [[1,1,1,1,1]], tags: 2,  minX: 10, minY: 0, maxX: 40, maxY: 10}
    ];

    t.equal(JSON.stringify(clipped), JSON.stringify(expected));

    t.end();
});

test('clips points', (t) => {
    const clipped = clip([
        {geometry: geom1, sqDist: [], type: 'MultiPoint', tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: geom2, sqDist: [], type: 'MultiPoint', tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    t.same(clipped, [{id: null, type: 'MultiPoint',
        geometry: [
            20, 10, 30,
            20, 20, 30,
            30, 20, 0,
            30, 30, 0,
            25, 40, 0,
            25, 50, 0,
            25, 60, 0], sqDist: [], tags: 1, minX: 20, minY: 10, maxX: 30, maxY: 60}]);

    t.end();
});

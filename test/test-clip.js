
import test from 'tape';
import clip from '../src/clip';

/*eslint comma-spacing:0*/

var geom1 = [0,0,0,50,0,0,50,10,0,20,10,0,20,20,0,30,20,0,30,30,0,50,30,0,50,40,0,25,40,0,25,50,0,0,50,0,0,60,0,25,60,0];
var geom2 = [0,0,0,50,0,0,50,10,0,0,10,0];

test('clips polylines', function (t) {

    var clipped = clip([
        {geometry: geom1, type: 'LineString', tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: geom2, type: 'LineString', tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    var expected = [
        {id: null, type: 'MultiLineString', geometry: [
            [10,0,1,40,0,1],
            [40,10,1,20,10,0,20,20,0,30,20,0,30,30,0,40,30,1],
            [40,40,1,25,40,0,25,50,0,10,50,1],
            [10,60,1,25,60,0]], tags: 1, minX: 10, minY: 0, maxX: 40, maxY: 60},
        {id: null, type: 'MultiLineString', geometry: [
            [10,0,1,40,0,1],
            [40,10,1,10,10,1]], tags: 2, minX: 10, minY: 0, maxX: 40, maxY: 10}
    ];

    t.equal(JSON.stringify(clipped), JSON.stringify(expected));

    t.end();
});

test('clips lines with line metrics on', function (t) {

    var geom = geom1.slice();
    geom.size = 0;
    for (var i = 0; i < geom.length - 2; i += 2) {
        geom.size += Math.sqrt(Math.pow(geom[i + 2] - geom[i], 2) + Math.pow(geom[i + 3] - geom[i + 1], 2));
    }
    geom.start = 0;
    geom.end = geom.size;

    var clipped = clip([{geometry: geom, type: 'LineString', minX: 0, minY: 0, maxX: 50, maxY: 60}],
        1, 10, 40, 0, -Infinity, Infinity, {lineMetrics: true});

    t.same(
        clipped.map(function (f) { return [f.geometry.start, f.geometry.end]; }),
        [[10, 40], [70, 130], [160, 200], [230, 911.4042771522114]]
    );

    t.end();
});

function closed(geometry) {
    return [geometry.concat(geometry.slice(0, 3))];
}

test('clips polygons', function (t) {

    var clipped = clip([
        {geometry: closed(geom1), type: 'Polygon', tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: closed(geom2), type: 'Polygon', tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    var expected = [
        {id: null, type: 'Polygon', geometry: [[10,0,1,40,0,1,40,10,1,20,10,0,20,20,0,30,20,0,30,30,0,40,30,1,40,40,1,25,40,0,25,50,0,10,50,1,10,60,1,25,60,0,10,24,1,10,0,1]], tags: 1, minX: 10, minY: 0, maxX: 40, maxY: 60},
        {id: null, type: 'Polygon', geometry: [[10,0,1,40,0,1,40,10,1,10,10,1,10,0,1]], tags: 2,  minX: 10, minY: 0, maxX: 40, maxY: 10}
    ];

    t.equal(JSON.stringify(clipped), JSON.stringify(expected));

    t.end();
});

test('clips points', function (t) {

    var clipped = clip([
        {geometry: geom1, type: 'MultiPoint', tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: geom2, type: 'MultiPoint', tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity, {});

    t.same(clipped, [{id: null, type: 'MultiPoint',
        geometry: [20,10,0,20,20,0,30,20,0,30,30,0,25,40,0,25,50,0,25,60,0], tags: 1, minX: 20, minY: 10, maxX: 30, maxY: 60}]);

    t.end();
});

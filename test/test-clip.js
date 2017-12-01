'use strict';

var test = require('tape');
var clip = require('../src/clip');

/*eslint comma-spacing:0*/

var geom1 = [0,0,0,50,0,0,50,10,0,20,10,0,20,20,0,30,20,0,30,30,0,50,30,0,50,40,0,25,40,0,25,50,0,0,50,0,0,60,0,25,60,0];

var geom2 = [0,0,0,50,0,0,50,10,0,0,10,0];

var min1 = [0,0],
    max1 = [50,60],
    min2 = [0,0],
    max2 = [50,10];


test('clips polylines', function (t) {

    var clipped = clip([
        {geometry: geom1, type: 'LineString', tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: geom2, type: 'LineString', tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity);

    var expected = [
        {id: null, type: 'MultiLineString', geometry: [
            [10,0,1,40,0,1],
            [40,10,1,20,10,0,20,20,0,30,20,0,30,30,0,40,30,1],
            [40,40,1,25,40,0,25,50,0,10,50,1],
            [10,60,1,25,60,0]], tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {id: null, type: 'MultiLineString', geometry: [
            [10,0,1,40,0,1],
            [40,10,1,10,10,1]], tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ];

    t.equal(JSON.stringify(clipped), JSON.stringify(expected));

    t.end();
});

function closed(geometry) {
    return [geometry.concat(geometry.slice(0, 3))];
}

test('clips polygons', function (t) {

    var clipped = clip([
        {geometry: closed(geom1), type: 3, tags: 1, minX: 0, minY: 0, maxX: 50, maxY: 60},
        {geometry: closed(geom2), type: 3, tags: 2, minX: 0, minY: 0, maxX: 50, maxY: 10}
    ], 1, 10, 40, 0, -Infinity, Infinity);

    var expected = [
        {id: null, type: 3, geometry: [[[10,0],[40,0],[40,10],[20,10],[20,20],[30,20],[30,30],[40,30],
            [40,40],[25,40],[25,50],[10,50],[10,60],[25,60],[10,24],[10,0]]], tags: 1, min: [10,0], max: [40,60]},
        {id: null, type: 3, geometry: [[[10,0],[40,0],[40,10],[10,10],[10,0]]], tags: 2, min: [10,0], max: [40,10]}
    ];

    t.equal(JSON.stringify(clipped), JSON.stringify(expected));

    t.end();
});

test('clips points', function (t) {

    var clipped = clip([
        {geometry: geom1.slice(0, 3), type: 'Point', tags: 1, min: min1, max: max1},
        {geometry: geom2.slice(0, 3), type: 'Point', tags: 2, min: min2, max: max2}
    ], 1, 10, 40, 0, -Infinity, Infinity);

    t.same(clipped, [{id: null, type: 'Point',
        geometry: [[20,10],[20,20],[30,20],[30,30],[25,40],[25,50],[25,60]], tags: 1, min: [20,10], max: [30,60]}]);

    t.end();
});

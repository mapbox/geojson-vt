'use strict';

var test = require('tape');
var clip = require('../src/clip');

/*eslint comma-spacing:0*/

function intersectX(p0, p1, x) {
    return [x, (x - p0[0]) * (p1[1] - p0[1]) / (p1[0] - p0[0]) + p0[1]];
}

var geom1 = [[[0,0],[50,0],[50,10],[20,10],[20,20],[30,20],[30,30],
                 [50,30],[50,40],[25,40],[25,50],[0,50],[0,60],[25,60]]];

var geom2 = [[[0,0],[50,0],[50,10],[0,10]]];

var min1 = [0,0],
    max1 = [50,60],
    min2 = [0,0],
    max2 = [50,10];


test('clips polylines', function (t) {

    var clipped = clip([
        {geometry: geom1, type: 2, tags: 1, min: min1, max: max1},
        {geometry: geom2, type: 2, tags: 2, min: min2, max: max2}
    ], 1, 10, 40, 0, intersectX, -Infinity, Infinity);

    var expected = [
        {id: null, type: 2, geometry: [
            [[10,0],[40,0]],
            [[40,10],[20,10],[20,20],[30,20],[30,30],[40,30]],
            [[40,40],[25,40],[25,50],[10,50]],
            [[10,60],[25,60]]], tags: 1, min: [10,0], max: [40,60]},
        {id: null, type: 2, geometry: [
            [[10,0],[40,0]],
            [[40,10],[10,10]]], tags: 2, min: [10,0], max: [40,10]}
    ];

    t.equal(JSON.stringify(clipped), JSON.stringify(expected));

    t.end();
});

function closed(geometry) {
    return [geometry[0].concat([geometry[0][0]])];
}

test('clips polygons', function (t) {

    var clipped = clip([
        {geometry: closed(geom1), type: 3, tags: 1, min: min1, max: max1},
        {geometry: closed(geom2), type: 3, tags: 2, min: min2, max: max2}
    ], 1, 10, 40, 0, intersectX, -Infinity, Infinity);

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
        {geometry: geom1[0], type: 1, tags: 1, min: min1, max: max1},
        {geometry: geom2[0], type: 1, tags: 2, min: min2, max: max2}
    ], 1, 10, 40, 0, intersectX, -Infinity, Infinity);

    t.same(clipped, [{id: null, type: 1,
        geometry: [[20,10],[20,20],[30,20],[30,30],[25,40],[25,50],[25,60]], tags: 1, min: [20,10], max: [30,60]}]);

    t.end();
});


var test = require('tape');
var clip = require('../src/clip');


function intersectX(p0, p1, x) {
    return [x, (x - p0[0]) * (p1[1] - p0[1]) / (p1[0] - p0[0]) + p0[1]];
}

var coords1 =
    [[0, 0], [50, 0], [50, 10], [20, 10], [20, 20], [30, 20], [30, 30],
     [50, 30], [50, 40], [25, 40], [25, 50], [0, 50], [0, 60], [25, 60]];

var coords2 = [[0, 0], [50, 0], [50, 10], [0, 10]];


test('clips polylines', function (t) {

    var clipped = clip([
        {coords: coords1, type: 2, props: 1},
        {coords: coords2, type: 2, props: 2}
    ], 10, 40, 0, intersectX);

    t.same(clipped, [
        {"coords":[[10,0],[40,0]],"type":2,"props":1},
        {"coords":[[40,10],[20,10],[20,20],[30,20],[30,30],[40,30]],"type":2,"props":1},
        {"coords":[[40,40],[25,40],[25,50],[10,50]],"type":2,"props":1},
        {"coords":[[10,60],[25,60]],"type":2,"props":1},
        {"coords":[[10,0],[40,0]],"type":2,"props":2},
        {"coords":[[40,10],[10,10]],"type":2,"props":2}
    ]);

    t.end();
});


test('clips polygons', function (t) {

    var clipped = clip([
        {coords: coords1, type: 3, props: 1},
        {coords: coords2, type: 3, props: 2}
    ], 10, 40, 0, intersectX);

    t.same(clipped, [
        {"coords":[[10,0],[40,0],[40,10],[20,10],[20,20],[30,20],[30,30],[40,30],
                   [40,40],[25,40],[25,50],[10,50],[10,60],[25,60]],"type":3,"props":1},
        {"coords":[[10,0],[40,0],[40,10],[10,10]],"type":3,"props":2}
    ]);

    t.end();
});

test('clips points', function (t) {

    var clipped = clip([
        {coords: coords1, type: 1, props: 1},
        {coords: coords2, type: 1, props: 2}
    ], 10, 40, 0, intersectX);

    t.same(clipped, [{"coords":[[20,10],[20,20],[30,20],[30,30],[25,40],[25,50],[25,60]],"type":1,"props":1}]);

    t.end();
});


var Benchmark = require('benchmark');
var clip = require('../src/clip');

function belowX(p, x) { return p[0] < x; }
function aboveX(p, x) { return p[0] > x; }

function intersectX(a, b, x) {
    return [x, (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]) + a[1]];
}

var coords1 =
    [[[0, 0], [50, 0], [50, 10], [20, 10], [20, 20], [30, 20], [30, 30],
     [50, 30], [50, 40], [25, 40], [25, 50], [0, 50], [0, 60], [25, 60]]];

var coords2 = [[[0, 0], [50, 0], [50, 10], [0, 10]]];


var polylines = [
    {geometry: coords1, type: 2, tags: 1},
    {geometry: coords2, type: 2, tags: 2}
];

var polygons = [
    {geometry: coords1, type: 3, tags: 1},
    {geometry: coords2, type: 3, tags: 2}
];

var points = [
    {geometry: coords1[0], type: 1, tags: 1},
    {geometry: coords2[0], type: 1, tags: 2}
];

new Benchmark.Suite()
.add('polylines', function() {
    clip(polylines, 1, 10, 40, 0, intersectX);
})
.add('polygons', function() {
    clip(polygons, 1, 10, 40, 0, intersectX);
})
.add('points', function() {
    clip(points, 1, 10, 40, 0, intersectX);
})
.on('cycle', function(event) {
    console.log(String(event.target));
})
.run();

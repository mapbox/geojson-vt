'use strict';

var test = require('tape');
var fs = require('fs');
var path = require('path');
var geojsonvt = require('../src/index');

var square = [{
    geometry: [[[-64, 4160], [-64, -64], [4160, -64], [4160, 4160], [-64, 4160]]],
    type: 3,
    tags: {name: 'Pennsylvania', density: 284.3}
}];

test('getTile: us-states.json', function (t) {
    var log = console.log;

    console.log = function () {};
    var index = geojsonvt(getJSON('us-states.json'), {debug: 2});

    var tile1 = index.getTile(7, 37, 48).features,
        tile2 = index.getTile(9, 148, 192).features,
        tile3 = index.getTile(11, 592, 768).features;

    console.log = log;

    t.same(tile1, getJSON('us-states-z7-37-48.json'), 'z7-37-48');

    t.same(tile2, square, 'z9-148-192 (clipped square)');
    t.same(tile3, square, 'z11-592-768 (clipped square)');
    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + name)));
}

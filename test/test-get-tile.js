'use strict';

var test = require('tape');
var fs = require('fs');
var path = require('path');
var geojsonvt = require('../src/index');

var square = [{
    geometry: [[[-64, 4160], [-64, -64], [4160, -64], [4160, 4160], [-64, 4160]]],
    type: 3,
    tags: {name: 'Pennsylvania', density: 284.3},
    id: '42'
}];

test('getTile: us-states.json', function (t) {
    var log = console.log;

    console.log = function () {};
    var index = geojsonvt(getJSON('us-states.json'), {debug: 2});

    console.log = log;

    t.same(index.getTile(7, 37, 48).features, getJSON('us-states-z7-37-48.json'), 'z7-37-48');

    t.same(index.getTile(9, 148, 192).features, square, 'z9-148-192 (clipped square)');
    t.same(index.getTile(11, 592, 768).features, square, 'z11-592-768 (clipped square)');

    t.equal(index.getTile(11, 800, 400), null, 'non-existing tile');
    t.equal(index.getTile(-5, 123.25, 400.25), null, 'invalid tile');

    t.equal(index.total, 37);

    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + name)));
}

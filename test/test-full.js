'use strict';

var test = require('tape');
var fs = require('fs');
var path = require('path');
var genTiles = require('./gen-tiles');

testTiles('us-states.json', 'us-states-tiles.json', 7, 200);
testTiles('dateline.json', 'dateline-tiles.json');
testTiles('feature.json', 'feature-tiles.json');
testTiles('collection.json', 'collection-tiles.json');

test('throws on invalid GeoJSON', function (t) {
    t.throws(function () {
        genTiles({type: 'Pologon'});
    });
    t.end();
});

function testTiles(inputFile, expectedFile, maxZoom, maxPoints) {
    test('full tiling test: ' + inputFile, function (t) {
        t.same(genTiles(getJSON(inputFile), maxZoom, maxPoints), getJSON(expectedFile));
        t.end();
    });
}

test('empty geojson', function (t) {
    t.same(genTiles(getJSON('empty.json')), {});
    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + name)));
}

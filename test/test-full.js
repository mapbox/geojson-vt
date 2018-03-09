'use strict';

var test = require('tape');
var fs = require('fs');
var path = require('path');
var genTiles = require('./gen-tiles');

testTiles('us-states.json', 'us-states-tiles.json', {indexMaxZoom: 7, indexMaxPoints: 200});
testTiles('dateline.json', 'dateline-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000});
testTiles('dateline.json', 'dateline-metrics-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000, lineMetrics: true});
testTiles('feature.json', 'feature-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000});
testTiles('collection.json', 'collection-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000});
testTiles('single-geom.json', 'single-geom-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000});

test('throws on invalid GeoJSON', function (t) {
    t.throws(function () {
        genTiles({type: 'Pologon'});
    });
    t.end();
});

function testTiles(inputFile, expectedFile, options) {
    test('full tiling test: ' + expectedFile.replace('-tiles.json', ''), function (t) {
        var tiles = genTiles(getJSON(inputFile), options);
        // fs.writeFileSync(path.join(__dirname, '/fixtures/' + expectedFile), JSON.stringify(tiles));
        t.same(getJSON(expectedFile), tiles);
        t.end();
    });
}

test('empty geojson', function (t) {
    t.same({}, genTiles(getJSON('empty.json')));
    t.end();
});

test('null geometry', function (t) {
    // should ignore features with null geometry
    t.same({}, genTiles(getJSON('feature-null-geometry.json')));
    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + name)));
}

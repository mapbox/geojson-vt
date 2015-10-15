'use strict';

var test = require('tape');
var fs = require('fs');
var path = require('path');

var geojsonvt = require('../');

test('create a single tile', function (t) {
    var data = getJSON('feature.json');
    var tile = geojsonvt.createTile(data, 0, 0, 0, {});
    t.same(tile.features, getJSON('feature-tiles.json')['z0-0-0']);
    t.end();
});

test('consistent with with full-index tiles', function (t) {
    var data = getJSON('feature.json');
    // use a tile that will result in some clipping here:
    var tile = geojsonvt.createTile(data, 1, 1, 0, {});
    // get the equivalent one from a normal geojson-vt index:
    var fromIndex = geojsonvt(data, {}).getTile(1, 1, 0);
    delete tile.source;
    delete fromIndex.source;
    t.same(tile, fromIndex);
    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + name)));
}

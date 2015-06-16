'use strict';

var test = require('tape');
var fs = require('fs');
var path = require('path');
var geojsonvt = require('../src/index');

test('getTile: us-states.json, z7-37-48', function (t) {
    var index = geojsonvt(getJSON('us-states.json'));
    t.same(index.getTile(7, 37, 48).features, getJSON('us-states-z7-37-48.json'));
    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + name)));
}

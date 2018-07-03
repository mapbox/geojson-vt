
import test from 'tape';
import fs from 'fs';
import path from 'path';
import geojsonvt from '../src/index';

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
        t.same(tiles, getJSON(expectedFile));
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

test('promote ids', function (t) {
    const data = getJSON('ids.json');
    const tileIndex = geojsonvt(data, {
        promoteId: 'prop0',
        indexMaxZoom: 0
    });
    const features = tileIndex.getTile(0, 0, 0).features;
    features.forEach((f) => {
        t.same(f.tags.prop0, f.id);
    });
    t.end();
});

test('generate ids', function (t) {
    const data = getJSON('ids.json');
    const tileIndex = geojsonvt(data, {
        generateId: true,
        indexMaxZoom: 0
    });
    const features = tileIndex.getTile(0, 0, 0).features;
    for (let i = 0; i < features.length; i++) {
        t.same(i, features[i].id);
    }
    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + name)));
}

function genTiles(data, options) {
    var index = geojsonvt(data, Object.assign({
        indexMaxZoom: 0,
        indexMaxPoints: 10000
    }, options));

    var output = {};

    for (var id in index.tiles) {
        var tile = index.tiles[id];
        var z = tile.z;
        output['z' + z + '-' + tile.x + '-' + tile.y] = index.getTile(z, tile.x, tile.y).features;
    }

    return output;
}


import test from 'tape';
import fs from 'fs';
import path from 'path';
import geojsonvt from '../src/index.js';

testTiles('us-states.json', 'us-states-tiles.json', {indexMaxZoom: 7, indexMaxPoints: 200});
testTiles('dateline.json', 'dateline-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000});
testTiles('dateline.json', 'dateline-metrics-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000, lineMetrics: true});
testTiles('feature.json', 'feature-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000});
testTiles('collection.json', 'collection-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000});
testTiles('single-geom.json', 'single-geom-tiles.json', {indexMaxZoom: 0, indexMaxPoints: 10000});
testTiles('ids.json', 'ids-promote-id-tiles.json', {indexMaxZoom: 0, promoteId: 'prop0'});
testTiles('ids.json', 'ids-generate-id-tiles.json', {indexMaxZoom: 0, generateId: true});

test('throws on invalid GeoJSON', (t) => {
    t.throws(() => {
        genTiles({type: 'Pologon'});
    });
    t.end();
});

function testTiles(inputFile, expectedFile, options) {
    test(`full tiling test: ${  expectedFile.replace('-tiles.json', '')}`, (t) => {
        const tiles = genTiles(getJSON(inputFile), options);
        // fs.writeFileSync(path.join(__dirname, '/fixtures/' + expectedFile), JSON.stringify(tiles));
        t.same(tiles, getJSON(expectedFile));
        t.end();
    });
}

test('empty geojson', (t) => {
    t.same({}, genTiles(getJSON('empty.json')));
    t.end();
});

test('null geometry', (t) => {
    // should ignore features with null geometry
    t.same({}, genTiles(getJSON('feature-null-geometry.json')));
    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, `/fixtures/${  name}`)));
}

function genTiles(data, options) {
    const index = geojsonvt(data, Object.assign({
        indexMaxZoom: 0,
        indexMaxPoints: 10000
    }, options));

    const output = {};

    for (const id in index.tiles) {
        const tile = index.tiles[id];
        const z = tile.z;
        output[`z${  z  }-${  tile.x  }-${  tile.y}`] = index.getTile(z, tile.x, tile.y).features;
    }

    return output;
}

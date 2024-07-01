import test from 'tape';
import fs from 'fs';
import path from 'path';
import {geoJSONToTile} from '../src/index.js';

const square = [{
    geometry: [[[4160, -64], [4160, 4160], [-64, 4160], [-64, -64], [4160, -64]]],
    type: 3,
    tags: {name: 'Pennsylvania', density: 284.3},
    id: '42'
}];

test('geoJSONToTile: converts all geometries to a single vector tile', (t) => {
    const geojson = getJSON('single-tile.json');
    const tile = geoJSONToTile(geojson, 12, 1171, 1566);

    t.equal(tile.features.length, 1, 'z12-1171-1577');
    t.equal(tile.features[0].tags.name, 'P Street Northwest - Massachusetts Avenue Northwest');

    t.end();
});

test('geoJSONToTile: clips geometries outside the tile', (t) => {
    const geojson = getJSON('us-states.json');

    const tile1 = geoJSONToTile(geojson, 7, 37, 48, {}, false, true);
    t.same(tile1.features, getJSON('us-states-z7-37-48.json'), 'z7-37-48');

    const tile2 = geoJSONToTile(geojson, 9, 148, 192, {}, false, true);
    t.same(tile2.features, square, 'z9-148-192 (clipped square)');

    t.equal(geoJSONToTile(geojson, 11, 800, 400, {}, false, true), null, 'non-existing tile');
    t.equal(geoJSONToTile(geojson, -5, 123.25, 400.25, {}, false, true), null, 'invalid tile');
    t.equal(geoJSONToTile(geojson, 25, 200, 200, {}, false, true), null, 'invalid tile');

    t.end();
});

function getJSON(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, `/fixtures/${  name}`)));
}

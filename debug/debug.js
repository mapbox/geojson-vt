
var tileGeoJSON = require('../src/tilegeojson.js');

var route = require('../test/fixtures/route.json');
var tmcw = require('../test/fixtures/tiles.json');
var states = require('../test/fixtures/us-states.json');

var test = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[-180, -85], [-180, 85], [180, 85], [180, -85], [-180, -85]]]
        }
    }]
};

var tiles = tileGeoJSON(route, 14);

var keys = Object.keys(tiles);

console.log('total tiles', keys.length);

// console.log(tiles[keys[Math.round(keys.length / 4)]][0].coords);

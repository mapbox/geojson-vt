
var geojsonvt = require('../src/index.js');

var route = require('./data/route.json');
var tmcw = require('./data/tiles.json');
var states = require('./data/us-states.json');

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

var tileIndex = geojsonvt(route, 14);

var keys = Object.keys(tileIndex.tiles);

console.log(tileIndex.stats);
console.log('total tiles', keys.length);

// console.log(tiles[keys[Math.round(keys.length / 4)]][0].coords);

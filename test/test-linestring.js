
var tileGeoJSON = require('../src/tilegeojson.js');
var route = require('./fixtures/route.json');

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

// var keys = Object.keys(tiles);
// console.log(tiles[keys[Math.round(keys.length / 2)]][0].coords);

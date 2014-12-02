
var tileGeoJSON = require('../src/tilegeojson.js');
var route = require('./fixtures/route.json');

// var test = {
//     "type": "FeatureCollection",
//     "features": [{
//         "type": "Feature",
//         "geometry": {
//             "type": "LineString",
//             "coordinates": [[0, 0], [10, 10], [20, 10], [25, 5], [30, -10]]
//         }
//     }]
// };

var tiles = tileGeoJSON(route, 24);

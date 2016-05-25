'use strict';

var fs = require('fs');
var geojsonvt = require('../src/index');

module.exports = genTiles;

if (require.main === module) { // if called directly
    var result = genTiles(JSON.parse(fs.readFileSync(process.argv[2])), process.argv[3], process.argv[4]);
    console.log(JSON.stringify(result));
}

function genTiles(data, maxZoom, maxPoints) {
    var index = geojsonvt(data, {
        indexMaxZoom: maxZoom || 0,
        indexMaxPoints: maxPoints || 10000
    });

    var output = {};

    for (var id in index.tiles) {
        var tile = index.tiles[id];
        var z = Math.log(tile.z2) / Math.LN2;
        output['z' + z + '-' + tile.x + '-' + tile.y] = index.getTile(z, tile.x, tile.y).features;
    }

    return output;
}

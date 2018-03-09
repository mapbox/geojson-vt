'use strict';

var fs = require('fs');
var geojsonvt = require('../src/index');

module.exports = genTiles;

if (require.main === module) { // if called directly
    var result = genTiles(JSON.parse(fs.readFileSync(process.argv[2])), process.argv[3], process.argv[4]);
    console.log(JSON.stringify(result));
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

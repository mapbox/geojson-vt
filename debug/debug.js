
var geojsonvt = require('../src/index.js');

console.time('load');
var data = require('./data/hsa.json');
console.timeEnd('load');

var tileIndex = geojsonvt(data, 14);

console.log(tileIndex.stats);

// tileIndex.maxZoom = 14;
// tileIndex.getTile(14, 4100, 6200);

// console.log(tileIndex.stats);

// tileIndex.getTile(14, 4100, 6000);

// console.log(tileIndex.stats);

var keys = Object.keys(tileIndex.tiles);
console.log('total tiles', keys.length);

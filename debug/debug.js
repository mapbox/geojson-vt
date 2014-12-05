
var geojsonvt = require('../src/index.js');

console.time('load data');
var data = require('./data/hrr.json');
console.timeEnd('load data');

var tileIndex = geojsonvt(data, {
	maxZoom: 14,
	debug: 1
});

// tileIndex.maxZoom = 14;
// tileIndex.getTile(14, 4100, 6200);
// tileIndex.getTile(14, 4100, 6000);

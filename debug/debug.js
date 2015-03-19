
var geojsonvt = require('../src/index.js');

console.time('load data');
var data = require('./data/hrr.json');
console.timeEnd('load data');

var tileIndex = geojsonvt(data, {
	maxZoom: 4,
	debug: 1
});

console.time('drill down');
for (var i = 0; i < 10; i++) {
    for (var j = 0; j < 10; j++) {
        tileIndex.getTile(7, 30 + i, 45 + j);
    }
}
for (var i = 0; i < 10; i++) {
    for (var j = 0; j < 10; j++) {
        tileIndex.getTile(8, 70 + i, 100 + j);
    }
}
console.timeEnd('drill down');

console.log('tiles after drilldown', Object.keys(tileIndex.tiles).length);


// tileIndex.maxZoom = 14;
// tileIndex.getTile(14, 4100, 6200);
// tileIndex.getTile(14, 4100, 6000);

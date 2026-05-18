import GeoJSONVT from '../src/index.js';
import {readFileSync} from 'fs';

console.time('load data');
const data = JSON.parse(readFileSync(new URL('data/hrr.json', import.meta.url)));
console.timeEnd('load data');

const tileIndex = new GeoJSONVT(data, {
    debug: 1
});

console.time('drill down');
for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
        tileIndex.getTile(7, 30 + i, 45 + j);
    }
}
for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
        tileIndex.getTile(8, 60 + i, 90 + j);
    }
}
for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
        tileIndex.getTile(10, 240 + i, 360 + j);
    }
}
console.timeEnd('drill down');

console.log('tiles generated:', tileIndex.total, JSON.stringify(tileIndex.stats));

// tileIndex.maxZoom = 14;
// tileIndex.getTile(14, 4100, 6200);
// tileIndex.getTile(14, 4100, 6000);

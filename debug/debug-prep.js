
var convert = require('../src/convert.js');

console.time('load data');
var data = require('./data/hrr.json');
console.timeEnd('load data');

console.time('convert');
convert(data, 5e-8);
console.timeEnd('convert');

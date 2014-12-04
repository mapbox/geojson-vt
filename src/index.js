'use strict';

module.exports = tileGeoJSON;

var clip = require('./clip');
var convert = require('./convert');
var transform = require('./transform');

var extent = 4096,
    tolerance = 1 / extent, // simplification tolerance
    padding = 0.05, // padding on each side of tile in percentage
    minPx = Math.round(-padding * extent),
    maxPx = Math.round((1 + padding) * extent);

function tileGeoJSON(geojson, maxZoom) {

    if (maxZoom === undefined) maxZoom = 14;

    console.time('preprocess features');

    var features = [],
        z2 = Math.pow(2, maxZoom); // simplify up to maxZoom

    for (var i = 0; i < geojson.features.length; i++) {
        features.push(convert(geojson.features[i], tolerance / z2));
    }
    console.timeEnd('preprocess features');

    var tiles = {},
        stats = {};

    console.time('generate tiles');
    if (features && features.length) splitTile(stats, tiles, features, 0, 1, 0, 0, 0, 0, 1, 1, maxZoom);
    console.timeEnd('generate tiles');

    console.log(stats);

    return tiles;
}

function splitTile(stats, tiles, features, z, z2, tx, ty, x1, y1, x2, y2, maxZoom) {

    var id = toID(z, tx, ty),
        tile = transform(features, z2, tx, ty, tolerance, extent);

    if (isClippedSquare(tile)) return; // useless tile

    tiles[id] = tile;
    stats[z] = (stats[z] || 0) + 1;

    if (z === maxZoom || coordsNumWithin(features, 100)) return;

    var x = (x1 + x2) / 2,
        y = (y1 + y2) / 2,
        p = (x2 - x1) * padding / 2,

        left  = clip(features, x1 - p, x + p, 0, intersectX),
        right = clip(features, x - p, x2 + p, 0, intersectX);

    if (left) {
        var tl = clip(left, y1 - p, y + p, 1, intersectY),
            bl = clip(left, y - p, y2 + p, 1, intersectY);

        if (tl) splitTile(stats, tiles, tl, z + 1, z2 * 2, tx * 2, ty * 2,     x1, y1, x, y, maxZoom);
        if (bl) splitTile(stats, tiles, bl, z + 1, z2 * 2, tx * 2, ty * 2 + 1, x1, y, x, y2, maxZoom);
    }

    if (right) {
        var tr = clip(right, y1 - p, y + p, 1, intersectY),
            br = clip(right, y - p, y2 + p, 1, intersectY);

        if (tr) splitTile(stats, tiles, tr, z + 1, z2 * 2, tx * 2 + 1, ty * 2,     x, y1, x2, y, maxZoom);
        if (br) splitTile(stats, tiles, br, z + 1, z2 * 2, tx * 2 + 1, ty * 2 + 1, x, y, x2, y2, maxZoom);
    }
}

function isClippedSquare(features) {
    if (features.length > 1) return false;
    var feature = features[0];
    if (feature.type !== 3) return false;

    for (var i = 0; i < feature.geometry.length; i++) {
        var p = feature.geometry[i];
        if (p[0] !== minPx && p[0] !== maxPx) return false;
        if (p[1] !== minPx && p[1] !== maxPx) return false;
    }
    return true;
}

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

function intersectX(a, b, x) {
    return [x, (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]) + a[1], -1];
}

function intersectY(a, b, y) {
    return [(y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]) + a[0], y, -1];
}

function coordsNumWithin(features, k) {
    var num = 0;
    for (var i = 0; i < features.length; i++) {
        num += features[i].geometry.length;
        if (num > k) return false;
    }
    return true;
}


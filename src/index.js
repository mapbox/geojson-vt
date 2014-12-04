'use strict';

module.exports = geojsonvt;

var clip = require('./clip'),
    convert = require('./convert'),
    transform = require('./transform'),

    extent = 4096,
    tolerance = 1 / extent, // simplification tolerance
    padding = 0.05, // padding on each side of tile in percentage

    minPx = Math.round(-padding * extent),
    maxPx = Math.round((1 + padding) * extent);


function geojsonvt(data, maxZoom) {
    return new GeoJSONVT(data, maxZoom);
}

function GeoJSONVT(data, maxZoom) {
    if (maxZoom === undefined) maxZoom = 14;
    this.maxZoom = maxZoom;

    console.time('preprocess features');

    var features = [],
        z2 = Math.pow(2, maxZoom);

    for (var i = 0; i < data.features.length; i++) {
        features.push(convert(data.features[i], tolerance / z2));
    }
    console.timeEnd('preprocess features');

    this.tiles = {};
    this.stats = {};

    console.time('generate tiles');
    this.splitTile(features, 0, 1, 0, 0, 0, 0, 1, 1);
    console.timeEnd('generate tiles');
}

GeoJSONVT.prototype.splitTile = function (features, z, z2, tx, ty, x1, y1, x2, y2) {

    var id = toID(z, tx, ty),
        tile = transform(features, z2, tx, ty, tolerance, extent);

    if (isClippedSquare(tile)) return; // useless tile

    this.tiles[id] = tile;
    this.stats[z] = (this.stats[z] || 0) + 1;

    if (z === this.maxZoom || coordsNumWithin(features, 100)) return;

    var x = (x1 + x2) / 2,
        y = (y1 + y2) / 2,
        p = (x2 - x1) * padding / 2,

        left  = clip(features, x1 - p, x + p, 0, intersectX),
        right = clip(features, x - p, x2 + p, 0, intersectX);

    if (left) {
        var tl = clip(left, y1 - p, y + p, 1, intersectY),
            bl = clip(left, y - p, y2 + p, 1, intersectY);

        if (tl) this.splitTile(tl, z + 1, z2 * 2, tx * 2, ty * 2,     x1, y1, x, y);
        if (bl) this.splitTile(bl, z + 1, z2 * 2, tx * 2, ty * 2 + 1, x1, y, x, y2);
    }

    if (right) {
        var tr = clip(right, y1 - p, y + p, 1, intersectY),
            br = clip(right, y - p, y2 + p, 1, intersectY);

        if (tr) this.splitTile(tr, z + 1, z2 * 2, tx * 2 + 1, ty * 2,     x, y1, x2, y);
        if (br) this.splitTile(br, z + 1, z2 * 2, tx * 2 + 1, ty * 2 + 1, x, y, x2, y2);
    }
};

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

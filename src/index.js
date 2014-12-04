'use strict';

module.exports = geojsonvt;

var clip = require('./clip'),
    convert = require('./convert'),
    createTile = require('./tile'),

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
    this.splitTile(features, 0, 1, 0, 0, 100);
    console.timeEnd('generate tiles');
}

GeoJSONVT.prototype.splitTile = function (features, z, z2, tx, ty, maxPoints) {

    var id = toID(z, tx, ty),
        tile = this.tiles[id];

    if (!tile) {
        tile = this.tiles[id] = createTile(features, z2, tx, ty, tolerance / z2, extent);
        this.stats[z] = (this.stats[z] || 0) + 1;
    }

    if (z === this.maxZoom || tile.numPoints <= maxPoints || isClippedSquare(tile.features)) {
        tile.source = features; // save original features for later on-demand tiling
        return;
    }

    // clean up the original features since we'll have them in children tiles
    tile.source = null;

    var k1 = 0.5 * padding,
        k2 = 0.5 - k1,
        k3 = 0.5 + k1,
        k4 = 1 + k1,

        left  = clip(features, z2, tx - k1, tx + k3, 0, intersectX),
        right = clip(features, z2, tx + k2, tx + k4, 0, intersectX);

    if (left) {
        var tl = clip(left, z2, ty - k1, ty + k3, 1, intersectY),
            bl = clip(left, z2, ty + k2, ty + k4, 1, intersectY);

        if (tl) this.splitTile(tl, z + 1, z2 * 2, tx * 2, ty * 2,     maxPoints);
        if (bl) this.splitTile(bl, z + 1, z2 * 2, tx * 2, ty * 2 + 1, maxPoints);
    }

    if (right) {
        var tr = clip(right, z2, ty - k1, ty + k3, 1, intersectY),
            br = clip(right, z2, ty + k2, ty + k4, 1, intersectY);

        if (tr) this.splitTile(tr, z + 1, z2 * 2, tx * 2 + 1, ty * 2,     maxPoints);
        if (br) this.splitTile(br, z + 1, z2 * 2, tx * 2 + 1, ty * 2 + 1, maxPoints);
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

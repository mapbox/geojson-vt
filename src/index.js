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
    this.maxPoints = 100;

    console.time('preprocess features');
    var features = [],
        z2 = Math.pow(2, maxZoom);

    for (var i = 0; i < data.features.length; i++) {
        var feature = convert(data.features[i], tolerance / z2);
        if (feature) features.push(feature);
    }
    console.timeEnd('preprocess features');

    this.tiles = {};
    this.stats = {};

    console.time('generate tiles');
    this.splitTile(features, 0, 0, 0);
    console.timeEnd('generate tiles');
}

GeoJSONVT.prototype.splitTile = function (features, z, x, y) {

    var stack = [features, z, x, y];

    while (stack.length) {
        features = stack.shift();
        z = stack.shift();
        x = stack.shift();
        y = stack.shift();

        var z2 = 1 << z,
            id = toID(z, x, y),
            tile = this.tiles[id];

        if (!tile) {
            // console.time('creation');
            tile = this.tiles[id] = createTile(features, z2, x, y, tolerance / z2, extent);
            // console.log('tile z' + z + '-' + x + '-' +  y + ' points: ' + tile.numPoints + ', simplified: ' + tile.numSimplified);
            // console.timeEnd('creation');
            this.stats[z] = (this.stats[z] || 0) + 1;
        }

        if (z === this.maxZoom || tile.numPoints <= this.maxPoints || isClippedSquare(tile.features)) {
            tile.source = features; // save original features for later on-demand tiling
            continue; // stop tiling
        }

        // clean up the original features since we'll have them in children tiles
        tile.source = null;

        // console.time('clipping');

        var k1 = 0.5 * padding,
            k2 = 0.5 - k1,
            k3 = 0.5 + k1,
            k4 = 1 + k1,

            left  = clip(features, z2, x - k1, x + k3, 0, intersectX),
            right = clip(features, z2, x + k2, x + k4, 0, intersectX),

            tl = null,
            bl = null,
            tr = null,
            br = null;

        if (left) {
            tl = clip(left, z2, y - k1, y + k3, 1, intersectY);
            bl = clip(left, z2, y + k2, y + k4, 1, intersectY);
        }

        if (right) {
            tr = clip(right, z2, y - k1, y + k3, 1, intersectY);
            br = clip(right, z2, y + k2, y + k4, 1, intersectY);
        }

        // console.timeEnd('clipping');

        if (tl) stack.push(tl, z + 1, x * 2, y * 2);
        if (bl) stack.push(bl, z + 1, x * 2, y * 2 + 1);
        if (tr) stack.push(tr, z + 1, x * 2 + 1, y * 2);
        if (br) stack.push(br, z + 1, x * 2 + 1, y * 2 + 1);
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

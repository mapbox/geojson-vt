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


function geojsonvt(data, options) {
    return new GeoJSONVT(data, options);
}

function GeoJSONVT(data, options) {
    this.options = extend(Object.create(this.options), options);

    var debug = this.options.debug;

    if (debug) console.time('preprocess data');

    var features = [],
        z2 = 1 << this.options.baseZoom;

    for (var i = 0; i < data.features.length; i++) {
        var feature = convert(data.features[i], tolerance / z2);
        if (feature) features.push(feature);
    }

    this.tiles = {};

    if (debug) {
        console.timeEnd('preprocess data');
        console.time('generate tiles');
        this.stats = [];
        this.total = 0;
    }

    this.splitTile(features, 0, 0, 0);

    if (debug) {
        console.timeEnd('generate tiles');
        console.log('tiles generated:', this.total, this.stats);
    }
}

GeoJSONVT.prototype.options = {
    maxZoom: 14,
    baseZoom: 14,
    maxPoints: 100,
    debug: 0
};

GeoJSONVT.prototype.splitTile = function (features, z, x, y, cz, cx, cy) {

    var stack = [features, z, x, y],
        maxZoom = this.options.maxZoom,
        baseZoom = this.options.baseZoom,
        maxPoints = this.options.maxPoints,
        debug = this.options.debug;

    while (stack.length) {
        features = stack.shift();
        z = stack.shift();
        x = stack.shift();
        y = stack.shift();

        var z2 = 1 << z,
            id = toID(z, x, y),
            tile = this.tiles[id],
            tileTolerance = (z === baseZoom ? 0 : 2) * tolerance / z2;

        if (!tile) {
            if (debug > 1) console.time('creation');

            tile = this.tiles[id] = createTile(features, z2, x, y, tileTolerance, extent);

            if (debug) {
                if (debug > 1) {
                    console.log('tile z%d-%d-%d (features: %d, points: %d, simplified: %d)',
                        z, x, y, tile.numFeatures, tile.numPoints, tile.numSimplified);
                    console.timeEnd('creation');
                }
                this.stats[z] = (this.stats[z] || 0) + 1;
                this.total++;
            }
        }

        if (!cz && (z === maxZoom || tile.numPoints <= maxPoints || isClippedSquare(tile.features)) || z === baseZoom) {
            tile.source = features;
            continue; // stop tiling
        }

        if (cz) tile.source = features;

        if (debug > 1) console.time('clipping');

        var k1 = 0.5 * padding,
            k2 = 0.5 - k1,
            k3 = 0.5 + k1,
            k4 = 1 + k1,

            tl, bl, tr, br, left, right,
            m, goLeft, goTop;

        if (cz) { // if we have a specific tile to drill down to, calculate where to go
            m = 1 << (cz - z);
            goLeft = cx / m - x < 0.5;
            goTop = cy / m - y < 0.5;
        }

        tl = bl = tr = br = left = right = null;

        if (!cz ||  goLeft) left  = clip(features, z2, x - k1, x + k3, 0, intersectX);
        if (!cz || !goLeft) right = clip(features, z2, x + k2, x + k4, 0, intersectX);

        if (left) {
            if (!cz ||  goTop) tl = clip(left, z2, y - k1, y + k3, 1, intersectY);
            if (!cz || !goTop) bl = clip(left, z2, y + k2, y + k4, 1, intersectY);
        }

        if (right) {
            if (!cz ||  goTop) tr = clip(right, z2, y - k1, y + k3, 1, intersectY);
            if (!cz || !goTop) br = clip(right, z2, y + k2, y + k4, 1, intersectY);
        }

        if (debug > 1) console.timeEnd('clipping');

        if (tl) stack.push(tl, z + 1, x * 2,     y * 2);
        if (bl) stack.push(bl, z + 1, x * 2,     y * 2 + 1);
        if (tr) stack.push(tr, z + 1, x * 2 + 1, y * 2);
        if (br) stack.push(br, z + 1, x * 2 + 1, y * 2 + 1);
    }
};

GeoJSONVT.prototype.getTile = function (z, x, y) {
    var id = toID(z, x, y);
    if (this.tiles[id]) return this.tiles[id];

    var debug = this.options.debug;

    if (debug) console.log('drilling down to z%d-%d-%d', z, x, y);

    var z0 = z,
        x0 = x,
        y0 = y,
        parent;

    while (!parent && z0 > 0) {
        z0--;
        x0 = Math.floor(x0 / 2);
        y0 = Math.floor(y0 / 2);
        parent = this.tiles[toID(z0, x0, y0)];
    }

    if (debug) console.log('found parent tile z%d-%d-%d', z0, x0, y0);

    if (parent.source) {
        if (debug) console.time('drilling down');
        this.splitTile(parent.source, z0, x0, y0, z, x, y);
        if (debug) console.timeEnd('drilling down');
    }

    return this.tiles[id];
};

function isClippedSquare(features) {
    if (features.length !== 1) return false;
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

function extend(dest, src) {
    for (var i in src) {
        dest[i] = src[i];
    }
    return dest;
}

module.exports = tileGeoJSON;

var simplify = require('./simplify');
var clip = require('./src/clip');

function transform(p) {
    var sin = Math.sin(p[1] * Math.PI / 180);
    var y = 512 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    if (y < 0) console.log(p[1], y);
    return [
        512 * (p[0] / 360 + 0.5),
        y
    ];
}

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

function tileGeoJSON(geojson, maxZoom) {
    var features = [{
        // temporarily hardcoded
        coords: geojson.features[0].geometry.coordinates.map(transform),
        type: 2,
        props: 1
    }];

    var tiles = {};
    var stats = {};

    console.time('tile');
    if (features && features.length) splitTile(stats, tiles, features, 0, 0, 0, 0, 0, 512, 512, maxZoom);
    console.timeEnd('tile');

    console.log('total tiles', Object.keys(tiles).length);
    console.log(stats);

    return tiles;
}

function intersectX(p0, p1, x) {
    return [x, (x - p0[0]) * (p1[1] - p0[1]) / (p1[0] - p0[0]) + p0[1]];
}

function intersectY(p0, p1, y) {
    return [(y - p0[1]) * (p1[0] - p0[0]) / (p1[1] - p0[1]) + p0[0], y];
}

function coordsNum(features, k) {
    var num = 0;
    for (var i = 0; i < features.length; i++) {
        num += features[i].coords.length;
    }
    return num;
}

function coordsNumWithin(features, k) {
    var num = 0;
    for (var i = 0; i < features.length; i++) {
        num += features[i].coords.length;
        if (num > k) return false;
    }
    return true;
}


function simplifyFeatures(features) {
    var simplified = [],
        effective = false,
        numCoords = 0;

    for (var i = 0; i < features.length; i++) {
        var coords = features[i].coords,
            simplifiedCoords = simplify(coords);

        // if (coords.length < simplifiedCoords.length) console.log(coords, simplifiedCoords);

        if (coords.length - simplifiedCoords.length > 1) effective = true;
        numCoords += coords.length;

        simplified.push({
            coords: simplifiedCoords,
            type: features[i].type,
            props: features[i].props
        });
    }
    return effective ? simplified : false;
}

function doubleCoords(features) {
    for (var i = 0; i < features.length; i++) {
        var coords = features[i].coords;
        for (var j = 0; j < coords.length; j++) {
            coords[j] = [coords[j][0] * 2, coords[j][1] * 2];
        }
    }
    return features;
}

function splitTile(stats, tiles, features, z, tx, ty, x1, y1, x2, y2, maxZoom) {

    stats[z] = (stats[z] || 0) + 1;

    var id = toID(z, tx, ty);

    if (coordsNumWithin(features, 100)) {
        tiles[id] = features;
        return;
    }

    var simplified = simplifyFeatures(features);

    if (!simplified) {
        tiles[id] = features;
        return;
    }

    tiles[id] = simplified;

    if (z === maxZoom) return;

    var x = (x1 + x2) / 2,
        y = (y1 + y2) / 2,
        p = 25,

        left  = clip(features, x1 - p, x + p, 0, intersectX),
        right = clip(features, x - p, x2 + p, 0, intersectX);


    if (left) {
        var topLeft    = clip(left, y1 - p, y + p, 1, intersectY),
            bottomLeft = clip(left, y - p, y2 + p, 1, intersectY);

        if (topLeft)    splitTile(stats, tiles, doubleCoords(topLeft),     z + 1, tx * 2, ty * 2,     x1 * 2, y1 * 2, x * 2, y * 2, maxZoom);
        if (bottomLeft) splitTile(stats, tiles, doubleCoords(bottomLeft),  z + 1, tx * 2, ty * 2 + 1, x1 * 2, y * 2, x * 2, y2 * 2, maxZoom);
    }

    if (right) {
        var topRight    = clip(right, y1 - p, y + p, 1, intersectY),
            bottomRight = clip(right, y - p, y2 + p, 1, intersectY);

        if (topRight)    splitTile(stats, tiles, doubleCoords(topRight),    z + 1, tx * 2 + 1, ty * 2,     x * 2, y1 * 2, x2 * 2, y * 2, maxZoom);
        if (bottomRight) splitTile(stats, tiles, doubleCoords(bottomRight), z + 1, tx * 2 + 1, ty * 2 + 1, x * 2, y * 2, x2 * 2, y2 * 2, maxZoom);
    }
}

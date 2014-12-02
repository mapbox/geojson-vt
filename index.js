module.exports = tileGeoJSON;

var simplify = require('./simplify');

function transform(p) {
    var sin = Math.sin(p[1] * Math.PI / 180);
    var y = 512 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    if (y < 0) console.log(p[1], y);
    return [
        512 * (p[0] / 360 + 0.5),
        y
    ];
}

function toID(z, x, y, w) {
    w = w || 0;
    w *= 2;
    if (w < 0) w = w * -1 -1;
    var dim = 1 << z;
    return ((dim * dim * w + dim * y + x) * 32) + z;
}

function tileGeoJSON(geojson) {
    // temporarily hardcoded
    var coords = geojson.features[0].geometry.coordinates.map(transform);

    var features = [coords];

    console.time('tile');
    var tiles = {};
    splitTile(tiles, features, 0, 0, 0, 0, 0, 512, 512, 2, 0);
    console.timeEnd('tile');

    console.log(Object.keys(tiles).length);

    return tiles;
}

function intersectionX(p0, p1, x) {
    return [x, (x - p0[0]) * (p1[1] - p0[1]) / (p1[0] - p0[0]) + p0[1]];
}

function intersectionY(p0, p1, y) {
    return [(y - p0[1]) * (p1[0] - p0[0]) / (p1[1] - p0[1]) + p0[0], y];
}

function belowX(p, x) {
    return p[0] < x;
}
function aboveX(p, x) {
    return p[0] > x;
}
function belowY(p, y) {
    return p[1] < y;
}
function aboveY(p, y) {
    return p[1] > y;
}

function getSlice(coords, pIn, i, j, pOut) {
    var slice = coords.slice(i, j);
    if (pIn) slice.unshift(pIn);
    if (pOut) slice.push(pOut);
    return slice;
}

function cutOutPlane(features, k, inside, outside, intersection) {
    var slices = [];

    for (var i = 0; i < features.length; i++) {
        var coords = features[i],
            cut = 0,
            len = coords.length,
            pIn, pOut, slice;

        for (var j = 1; j < len; j++) {
            var a = coords[j - 1],
                b = coords[j];

            // segment goes inside -> save intersection and index
            if (outside(a, k) && inside(b, k)) {
                pIn = intersection(a, b, k);
                cut = j;

            // segment goes outside -> cut a slice
            } else if (inside(a, k) && outside(b, k)) {
                var pOut = intersection(a, b, k);
                slices.push(getSlice(coords, pIn, cut, j, pOut));
            }
        }

        // line ends up inside -> cut the final slice
        if (inside(coords[len - 1], k)) {
            slices.push(getSlice(coords, pIn, cut, j));
        }
    }

    return slices;
}

function coordsNumWithin(features, k) {
    var num = 0;
    for (var i = 0; i < features.length; i++) {
        num += features[i].length;
        if (num > k) return false;
    }
    return true;
}

function coordsNum(features, k) {
    var num = 0;
    for (var i = 0; i < features.length; i++) {
        num += features[i].length;
    }
    return num;
}

function simplifyFeatures(features, tolerance) {
    var simplified = [];
    for (var i = 0; i < features.length; i++) {
        simplified.push(simplify(features[i], tolerance));
    }
    return simplified;
}

function doubleCoords(features) {
    for (var i = 0; i < features.length; i++) {
        var coords = features[i];
        for (var j = 0; j < coords.length; j++) {
            coords[j] = [coords[j][0] * 2, coords[j][1] * 2];
        }
    }
    return features;
}

function splitTile(tiles, features, z, tx, ty, x1, y1, x2, y2, maxZoom, maxPoints) {

    if (features.length) {
        var simplified = simplifyFeatures(features, 1);
        tiles[toID(z, tx, ty)] = simplified;
        console.log('saved tile', z, tx, ty, (simplified));
    }

    if (z === maxZoom || coordsNumWithin(features, maxPoints)) return;

    var x = (x1 + x2) / 2,
        y = (y1 + y2) / 2,
        p = 25,

        left = cutOutPlane(features, x + p, belowX, aboveX, intersectionX),
        right = cutOutPlane(features, x - p, aboveX, belowX, intersectionX);

    if (left.length) {
        var topLeft = cutOutPlane(left, y + p, belowY, aboveY, intersectionY),
            bottomLeft = cutOutPlane(left, y - p, aboveY, belowY, intersectionY);

        splitTile(tiles, doubleCoords(topLeft),     z + 1, tx * 2, ty * 2,     x1 * 2, y1 * 2, x * 2, y * 2, maxZoom, maxPoints);
        splitTile(tiles, doubleCoords(bottomLeft),  z + 1, tx * 2, ty * 2 + 1, x1 * 2, y * 2, x * 2, y2 * 2, maxZoom, maxPoints);
    }

    if (right.length) {
        var topRight = cutOutPlane(right, y + p, belowY, aboveY, intersectionY),
            bottomRight = cutOutPlane(right, y + p, aboveY, belowY, intersectionY);

        splitTile(tiles, doubleCoords(topRight),    z + 1, tx * 2 + 1, ty * 2,     x * 2, y1 * 2, x2 * 2, y * 2, maxZoom, maxPoints);
        splitTile(tiles, doubleCoords(bottomRight), z + 1, tx * 2 + 1, ty * 2 + 1, x * 2, y * 2, x2 * 2, y2 * 2, maxZoom, maxPoints);
    }
}

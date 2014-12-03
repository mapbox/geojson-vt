module.exports = tileGeoJSON;

var simplify = require('./simplify');
var clip = require('./clip');


function tileGeoJSON(geojson, maxZoom) {

    var features = [];

    for (var i = 0; i < geojson.features.length; i++) {
        var feature = geojson.features[i],
            geom = feature.geometry;

        if (geom.type === 'LineString') {
            features.push({
                coords: geom.coordinates.map(transform),
                type: 2,
                props: feature.properties
            });

        } else if (geom.type === 'Polygon' && geom.coordinates.length === 1) {
            features.push({
                coords: geom.coordinates[0].map(transform),
                type: 3,
                props: feature.properties
            });

        } else {
            throw new Error('Unsupported GeoJSON type');
        }
    }

    var tiles = {};
    var stats = {};

    console.time('tile');
    if (features && features.length) splitTile(stats, tiles, features, 0, 0, 0, 0, 0, 512, 512, maxZoom);
    console.timeEnd('tile');

    console.log(stats);

    return tiles;
}

function splitTile(stats, tiles, features, z, tx, ty, x1, y1, x2, y2, maxZoom) {

    stats[z] = (stats[z] || 0) + 1;

    var id = toID(z, tx, ty);

    var simplified = simplifyFeatures(features);

    // if (features.length === 1 && features[0].coords.length - simplified[0].coords.length <= 1) {
    //     tiles[id] = features;
    //     return;
    // }

    // if (coordsNumWithin(features, 20)) {
    //     tiles[id] = features;
    //     return;
    // }

    tiles[id] = simplified;

    if (z === maxZoom) return;

    var x = (x1 + x2) / 2,
        y = (y1 + y2) / 2,
        p = 25,

        left  = clip(features, x1 - p, x + p, 0, intersectX),
        right = clip(features, x - p, x2 + p, 0, intersectX);

    tx *= 2;
    ty *= 2;
    z++;

    if (left) {
        var tl = clip(left, y1 - p, y + p, 1, intersectY),
            bl = clip(left, y - p, y2 + p, 1, intersectY);

        if (tl) splitTile(stats, tiles, doubleCoords(tl), z, tx, ty,     x1 * 2, y1 * 2, x * 2, y * 2, maxZoom);
        if (bl) splitTile(stats, tiles, doubleCoords(bl), z, tx, ty + 1, x1 * 2, y * 2, x * 2, y2 * 2, maxZoom);
    }

    if (right) {
        var tr = clip(right, y1 - p, y + p, 1, intersectY),
            br = clip(right, y - p, y2 + p, 1, intersectY);

        if (tr) splitTile(stats, tiles, doubleCoords(tr), z, tx + 1, ty,     x * 2, y1 * 2, x2 * 2, y * 2, maxZoom);
        if (br) splitTile(stats, tiles, doubleCoords(br), z, tx + 1, ty + 1, x * 2, y * 2, x2 * 2, y2 * 2, maxZoom);
    }
}

function simplifyFeatures(features) {
    var simplified = [];

    for (var i = 0; i < features.length; i++) {
        var coords = features[i].coords,
            simplifiedCoords = simplify(coords);

        simplified.push({
            coords: simplifiedCoords,
            type: features[i].type,
            props: features[i].props
        });
    }

    return simplified;
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

function transform(p) {
    var sin = Math.sin(p[1] * Math.PI / 180);
    return [
        512 * (p[0] / 360 + 0.5),
        512 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI)
    ];
}

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

function intersectX(p0, p1, x) {
    return [x, (x - p0[0]) * (p1[1] - p0[1]) / (p1[0] - p0[0]) + p0[1]];
}

function intersectY(p0, p1, y) {
    return [(y - p0[1]) * (p1[0] - p0[0]) / (p1[1] - p0[1]) + p0[0], y];
}

function coordsNum(features) {
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


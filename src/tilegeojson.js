module.exports = tileGeoJSON;

var simplify = require('./simplify');
var clip = require('./clip');

var tileSize = 4096,
    simplification = 1,
    padding = 0.05, // padding on each side of tile in percentage
    minPx = Math.round(-padding * tileSize),
    maxPx = Math.round((1 + padding) * tileSize);

function tileGeoJSON(geojson, maxZoom) {

    if (maxZoom === undefined) maxZoom = 14;

    console.time('preprocess features');

    var features = [],
        tolerance = simplification / (tileSize * Math.pow(2, maxZoom)); // simplify up to maxZoom

    for (var i = 0; i < geojson.features.length; i++) {
        var feature = geojson.features[i],
            geom = feature.geometry;

        if (geom.type === 'LineString') {
            features.push({
                coords: project(geom.coordinates, tolerance),
                type: 2,
                props: feature.properties
            });

        } else if (geom.type === 'Polygon' && geom.coordinates.length === 1) {
            features.push({
                coords: project(geom.coordinates[0], tolerance),
                type: 3,
                props: feature.properties
            });

        } else {
            throw new Error('Unsupported GeoJSON type');
        }
    }
    console.timeEnd('preprocess features');

    var tiles = {},
        stats = {};

    console.time('generate tiles');
    if (features && features.length) splitTile(stats, tiles, features, 0, 0, 0, 0, 0, 1, 1, maxZoom);
    console.timeEnd('generate tiles');

    console.log(stats);

    return tiles;
}

function splitTile(stats, tiles, features, z, tx, ty, x1, y1, x2, y2, maxZoom) {

    stats[z] = (stats[z] || 0) + 1;

    var id = toID(z, tx, ty),
        tile = tiles[id] = transformFeatures(features, Math.pow(2, z), tx, ty);

    if (z === maxZoom || isClippedSquare(tile)) return;

    var x = (x1 + x2) / 2,
        y = (y1 + y2) / 2,
        p = (x2 - x1) * padding / 2,

        left  = clip(features, x1 - p, x + p, 0, intersectX),
        right = clip(features, x - p, x2 + p, 0, intersectX);

    if (left) {
        var tl = clip(left, y1 - p, y + p, 1, intersectY),
            bl = clip(left, y - p, y2 + p, 1, intersectY);

        if (tl) splitTile(stats, tiles, tl, z + 1, tx * 2, ty * 2,     x1, y1, x, y, maxZoom);
        if (bl) splitTile(stats, tiles, bl, z + 1, tx * 2, ty * 2 + 1, x1, y, x, y2, maxZoom);
    }

    if (right) {
        var tr = clip(right, y1 - p, y + p, 1, intersectY),
            br = clip(right, y - p, y2 + p, 1, intersectY);

        if (tr) splitTile(stats, tiles, tr, z + 1, tx * 2 + 1, ty * 2,     x, y1, x2, y, maxZoom);
        if (br) splitTile(stats, tiles, br, z + 1, tx * 2 + 1, ty * 2 + 1, x, y, x2, y2, maxZoom);
    }
}

function transformFeatures(features, z2, tx, ty) {
    var transformed = [];

    for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        transformed.push({
            coords: transform(feature.coords, feature.type, z2, tx, ty),
            type: feature.type,
            props: feature.props
        });
    }
    return transformed;
}

// project original points, calculating simplification data along the way
function project(lonlats, tolerance) {
    var projected = [];
    for (var i = 0; i < lonlats.length; i++) {
        projected.push(projectPoint(lonlats[i]));
    }
    simplify(projected, tolerance);
    return projected;
}

// simplify and transform projected coordinates for tile geometry
function transform(points, type, z2, tx, ty) {
    var newPoints = [],
        tolerance = simplification / (tileSize * z2),
        sqTolerance = tolerance * tolerance;

    for (var i = 0, len = points.length; i < len; i++) {
        var p = points[i];
        // simplify, keeping points with significance > tolerance (plus 1st, last, and clip points on boundaries)
        if (type === 1 || i === 0 || i === len - 1 || p[2] === -1 || p[2] > sqTolerance) {
            newPoints.push(transformPoint(p, z2, tx, ty));
        }
    }
    return newPoints;
}

function projectPoint(p) {
    var sin = Math.sin(p[1] * Math.PI / 180),
        x = (p[0] / 360 + 0.5),
        y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return [x, y, 0];
}

function transformPoint(p, z2, tx, ty) {
    var x = Math.round(tileSize * (p[0] * z2 - tx)),
        y = Math.round(tileSize * (p[1] * z2 - ty));
    return [x, y];
}

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

function intersectX(a, b, x) { return [x, (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]) + a[1], -1]; }
function intersectY(a, b, y) { return [(y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]) + a[0], y, -1]; }

function isClippedSquare(features) {
    if (features.length > 1) return false;
    var feature = features[0];
    if (feature.type !== 3) return false;

    for (var i = 0; i < feature.coords.length; i++) {
        var p = feature.coords[i];
        if (p[0] !== minPx && p[0] !== maxPx) return false;
        if (p[1] !== minPx && p[1] !== maxPx) return false;
    }
    return true;
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


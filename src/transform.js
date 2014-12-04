'use strict';

module.exports = transform;

function transform(features, z2, tx, ty, tolerance, extent) {
    var transformed = [];

    for (var i = 0; i < features.length; i++) {
        var feature = features[i];

        transformed.push({
            geometry: transformGeometry(feature.geometry, feature.type, z2, tx, ty, tolerance / z2, extent),
            type: feature.type,
            tags: feature.tags || null
        });
    }
    return transformed;
}

// simplify and transform projected coordinates for tile geometry
function transformGeometry(points, type, z2, tx, ty, tolerance, extent) {
    var transformed = [],
        sqTolerance = tolerance * tolerance;

    for (var i = 0, len = points.length; i < len; i++) {
        var p = points[i];
        // simplify, keeping points with significance > tolerance (plus 1st, last, and clip points on boundaries)
        if (type === 1 || i === 0 || i === len - 1 || p[2] === -1 || p[2] > sqTolerance) {
            transformed.push(transformPoint(p, z2, tx, ty, extent));
        }
    }
    return transformed;
}

function transformPoint(p, z2, tx, ty, extent) {
    var x = Math.round(extent * (p[0] * z2 - tx)),
        y = Math.round(extent * (p[1] * z2 - ty));
    return [x, y];
}

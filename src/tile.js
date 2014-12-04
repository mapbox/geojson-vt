'use strict';

module.exports = createTile;

function createTile(features, z2, tx, ty, tolerance, extent) {
    var tile = {
        features: [],
        numPoints: 0,
        source: null
    };
    for (var i = 0; i < features.length; i++) {
        addFeature(tile, features[i], z2, tx, ty, tolerance, extent);
    }
    return tile;
}

function addFeature(tile, feature, z2, tx, ty, tolerance, extent) {

    var geom = feature.geometry,
        type = feature.type,
        transformed = [],
        sqTolerance = tolerance * tolerance;

    // simplify and transform projected coordinates for tile geometry
    for (var i = 0, len = geom.length; i < len; i++) {
        var p = geom[i];
        // simplify, keeping points with significance > tolerance and points introduced by clipping
        if (type === 1 || p[2] === -1 || p[2] > sqTolerance) {
            transformed.push(transformPoint(p, z2, tx, ty, extent));
        }
        tile.numPoints++;
    }

    tile.features.push({
        geometry: transformed,
        type: type,
        tags: feature.tags || null
    });
}

function transformPoint(p, z2, tx, ty, extent) {
    var x = Math.round(extent * (p[0] * z2 - tx)),
        y = Math.round(extent * (p[1] * z2 - ty));
    return [x, y];
}

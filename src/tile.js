'use strict';

module.exports = createTile;

function createTile(features, z2, tx, ty, tolerance, extent, noSimplify) {
    var tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: 0,
        source: null
    };
    for (var i = 0; i < features.length; i++) {
        tile.numFeatures++;
        addFeature(tile, features[i], z2, tx, ty, tolerance, extent, noSimplify);
    }
    return tile;
}

function addFeature(tile, feature, z2, tx, ty, tolerance, extent, noSimplify) {

    var geom = feature.geometry,
        type = feature.type,
        transformed = [],
        sqTolerance = tolerance * tolerance,
        i, j, ring, p;

    if (type === 1) {
        for (i = 0; i < geom.length; i++) {
            transformed.push(transformPoint(geom[i], z2, tx, ty, extent));
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else {

        // simplify and transform projected coordinates for tile geometry
        for (i = 0; i < geom.length; i++) {
            ring = geom[i];

            // filter out tiny polylines & polygons
            if (!noSimplify && ((type === 2 && ring.dist < tolerance) ||
                                (type === 3 && ring.area < sqTolerance))) {
                tile.numPoints += ring.length;
                continue;
            }

            var transformedRing = [];

            for (j = 0; j < ring.length; j++) {
                p = ring[j];
                // keep points with importance > tolerance
                if (noSimplify || p[2] > sqTolerance) {
                    transformedRing.push(transformPoint(p, z2, tx, ty, extent));
                    tile.numSimplified++;
                }
                tile.numPoints++;
            }

            transformed.push(transformedRing);
        }
    }

    if (transformed.length) {
        tile.features.push({
            geometry: transformed,
            type: type,
            tags: feature.tags || null
        });
    }
}

function transformPoint(p, z2, tx, ty, extent) {
    var x = Math.round(extent * (p[0] * z2 - tx)),
        y = Math.round(extent * (p[1] * z2 - ty));
    return [x, y];
}

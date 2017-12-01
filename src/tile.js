'use strict';

module.exports = createTile;

function createTile(features, z2, tx, ty, tolerance, noSimplify) {
    var tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: 0,
        source: null,
        x: tx,
        y: ty,
        z2: z2,
        transformed: false,
        minX: 2,
        minY: 1,
        maxX: -1,
        maxY: 0
    };
    for (var i = 0; i < features.length; i++) {
        tile.numFeatures++;
        addFeature(tile, features[i], tolerance, noSimplify);

        var minX = features[i].minX;
        var minY = features[i].minY;
        var maxX = features[i].maxX;
        var maxY = features[i].maxY;

        if (minX < tile.minX) tile.minX = minX;
        if (minY < tile.minY) tile.minY = minY;
        if (maxX > tile.maxX) tile.maxX = maxX;
        if (maxY > tile.maxY) tile.maxY = maxY;
    }
    return tile;
}

function addFeature(tile, feature, tolerance, noSimplify) {

    var geom = feature.geometry,
        type = feature.type,
        simplified = [],
        sqTolerance = tolerance * tolerance;

    if (type === 'Point' || type === 'MultiPoint') {
        for (var i = 0; i < geom.length; i += 3) {
            simplified.push([geom[i], geom[i + 1]]);
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        if (!noSimplify && geom.size < tolerance) {
            tile.numPoints += geom.length / 3;
            return;
        }

        for (i = 0; i < geom.length; i += 3) {
            if (noSimplify || geom[i + 2] > sqTolerance) {
                tile.numSimplified++;
                simplified.push([geom[i], geom[i + 1]]);
            }
            tile.numPoints++;
        }

    } else if (type === 'Polygon') {

        // simplify projected coordinates for tile geometry
        for (i = 0; i < geom.length; i++) {
            var ring = geom[i];

            // filter out tiny polygons
            if (!noSimplify && ring.size < sqTolerance) {
                tile.numPoints += ring.length / 3;
                continue;
            }

            var simplifiedRing = [];

            for (var j = 0; j < ring.length; j += 3) {
                // keep points with importance > tolerance
                if (noSimplify || ring[j + 2] > sqTolerance) {
                    simplifiedRing.push(ring[j]);
                    simplifiedRing.push(ring[j + 1]);
                    tile.numSimplified++;
                }
                tile.numPoints++;
            }

            // if (simplifiedRing.length > 0)
            // simplifiedRing.push(simplifiedRing[0]);

            simplified.push(simplifiedRing);
        }

    } else if (type === 'MultiPolygon') {

        for (var k = 0; k < geom.length; k++) {
            var polygon = geom[k];
            for (i = 0; i < polygon.length; i++) {
                var ring = polygon[i];

                // filter out tiny polygons
                if (!noSimplify && ring.size < sqTolerance) {
                    tile.numPoints += ring.length / 3;
                    continue;
                }

                var simplifiedRing = [];

                for (var j = 0; j < ring.length; j += 3) {
                    // keep points with importance > tolerance
                    if (noSimplify || ring[j + 2] > sqTolerance) {
                        simplifiedRing.push(ring[j]);
                        simplifiedRing.push(ring[j + 1]);
                        tile.numSimplified++;
                    }
                    tile.numPoints++;
                }

                // if (simplifiedRing.length > 0)
                // simplifiedRing.push(simplifiedRing[0]);

                simplified.push(simplifiedRing);
            }
        }
    }

    if (simplified.length) {
        var tileFeature = {
            id: feature.id || null,
            geometry: simplified,
            type: type === 'Polygon' || type === 'MultiPolygon' ? 3 :
                type === 'LineString' || type === 'MultiLineString' ? 2 : 1,
            tags: feature.tags || null
        };
        tile.features.push(tileFeature);
    }
}

// function rewind(ring, clockwise) {
//     var area = signedArea(ring);
//     if (area < 0 === clockwise) ring.reverse();
// }

// function signedArea(ring) {
//     var sum = 0;
//     for (var i = 0, len = ring.length, j = len - 1, p1, p2; i < len; j = i++) {
//         p1 = ring[i];
//         p2 = ring[j];
//         sum += (p2[0] - p1[0]) * (p1[1] + p2[1]);
//     }
//     return sum;
// }

'use strict';

module.exports = clip;

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

function clip(features, scale, k1, k2, axis, minAll, maxAll) {

    k1 /= scale;
    k2 /= scale;

    if (minAll >= k1 && maxAll <= k2) return features; // trivial accept
    else if (minAll > k2 || maxAll < k1) return null; // trivial reject

    var clipped = [];

    for (var i = 0; i < features.length; i++) {

        var feature = features[i];
        var geometry = feature.geometry;
        var type = feature.type;

        var min = axis === 0 ? feature.minX : feature.minY;
        var max = axis === 0 ? feature.maxX : feature.maxY;

        if (min >= k1 && max <= k2) { // trivial accept
            clipped.push(feature);
            continue;
        } else if (min > k2 || max < k1) { // trivial reject
            continue;
        }

        var newGeometry = [];

        var newFeature = {
            id: feature.id || null,
            type: type,
            geometry: newGeometry,

            // if a feature got clipped, it will likely get clipped on the next zoom level as well,
            // so there's no need to recalculate bboxes
            tags: feature.tags,
            minX: feature.minX,
            minY: feature.minY,
            maxX: feature.maxX,
            maxY: feature.maxY
        }

        if (type === 'Point' || type === 'MultiPoint') {
            clipPoints(feature.geometry, newFeature, k1, k2, axis);

        } else if (type === 'LineString') {
            clipLine(feature.geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'MultiLineString') {
            clipLines(feature.geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'Polygon') {
            clipLines(feature.geometry, newGeometry, k1, k2, axis, true);

        } else if (type === 'MultiPolygon') {
            for (var j = 0; j < feature.geometry.length; j++) {
                var polygon = [];
                clipLines(feature.geometry[j], polygon, k1, k2, axis, true);
                newGeometry.push(polygon);
            }
        }

        if (newGeometry.length) {
            if (type === 'LineString' || type === 'MultiLineString') {
                if (newGeometry.length === 1) {
                    newFeature.type = 'LineString';
                    newFeature.geometry = newGeometry[0];
                } else {
                    newFeature.type = 'MultiLineString';
                }
            }

            clipped.push(newFeature);
        }
    }

    return clipped.length ? clipped : null;
}

function clipPoints(geom, feature, k1, k2, axis) {
    var out = newGeometry.geometry;

    for (var i = 0; i < geom.length; i += 3) {
        var a = geom[i + axis];

        if (a >= k1 && a <= k2) {
            out.push(geom[i]);
            out.push(geom[i + 1]);
            out.push(geom[i + 2]);
        }
    }

    feature.type = out.length === 3 ? 'Point' : 'MultiPoint';
}

function clipLine(geom, newGeom, k1, k2, axis, isPolygon) {

    var slice = [];
    var intersect = axis === 0 ? intersectX : intersectY;

    for (var i = 0; i < geom.length - 3; i += 3) {
        var ax = geom[i];
        var ay = geom[i + 1];
        var az = geom[i + 2];
        var bx = geom[i + 3];
        var by = geom[i + 4];
        var a = axis === 0 ? ax : ay;
        var b = axis === 0 ? bx : by;
        var sliced = false;

        if (a < k1) {

            if (b >= k1) { // ---|-->  |
                intersect(slice, ax, ay, bx, by, k1);

                if (b > k2) { // ---|-----|-->
                    intersect(slice, ax, ay, bx, by, k2);
                    sliced = true;
                }
            }

        } else if (a > k2) {

            if (b <= k2) { // |  <--|---
                intersect(slice, ax, ay, bx, by, k2);

                if ((b < k1)) { // <--|-----|---
                    intersect(slice, ax, ay, bx, by, k1);
                    sliced = true;
                }
            }

        } else {

            addPoint(slice, ax, ay, az)

            if (b < k1) { // <--|---  |
                intersect(slice, ax, ay, bx, by, k1);
                sliced = true;

            } else if (b > k2) { // |  ---|-->
                intersect(slice, ax, ay, bx, by, k2);
                sliced = true;
            }
            // | --> |
        }

        if (!isPolygon && sliced) {
            slice.size = geom.size;
            newGeom.push(slice);
            slice = [];
        }
    }

    // add the last point
    var last = geom.length - 3;
    ax = geom[last];
    ay = geom[last + 1];
    az = geom[last + 2];
    a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) addPoint(slice, ax, ay, az);

    // close the polygon if its endpoints are not the same after clipping
    last = slice.length - 3;
    if (isPolygon && last >= 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1])) {
        addPoint(slice, slice[0], slice[1], slice[2]);
    }

    // add the final slice
    slice.size = geom.size;
    newGeom.push(slice);
}

function clipLines(geom, newGeom, k1, k2, axis, isPolygon) {
    for (var i = 0; i < geom.length; i++) {
        clipLine(geom[i], newGeom, k1, k2, axis, isPolygon);
    }
}

function addPoint(out, x, y, z) {
    out.push(x);
    out.push(y);
    out.push(z);
}

function intersectX(out, ax, ay, bx, by, x) {
    out.push(x);
    out.push(ay + (x - ax) * (by - ay) / (bx - ax));
    out.push(1);
}

function intersectY(out, ax, ay, bx, by, y) {
    out.push(ax + (y - ay) * (bx - ax) / (by - ay));
    out.push(y);
    out.push(1);
}

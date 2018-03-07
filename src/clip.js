'use strict';

module.exports = clip;

var createFeature = require('./feature');

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 *     k1       k2
 */

function clip(features, scale, k1, k2, axis, minAll, maxAll, options) {

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

        if (type === 'Point' || type === 'MultiPoint') {
            clipPoints(geometry, newGeometry, k1, k2, axis);

        } else if (type === 'LineString') {
            clipLine(geometry, newGeometry, k1, k2, axis, false, options.lineMetrics);

        } else if (type === 'MultiLineString') {
            clipLines(geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'Polygon') {
            clipLines(geometry, newGeometry, k1, k2, axis, true);

        } else if (type === 'MultiPolygon') {
            for (var j = 0; j < geometry.length; j++) {
                var polygon = [];
                clipLines(geometry[j], polygon, k1, k2, axis, true);
                if (polygon.length) {
                    newGeometry.push(polygon);
                }
            }
        }

        if (newGeometry.length) {
            if (options.lineMetrics && type === 'LineString') {
                for (j = 0; j < newGeometry.length; j++) {
                    clipped.push(createFeature(feature.id, type, newGeometry[j], feature.tags));
                }
                continue;
            }

            if (type === 'LineString' || type === 'MultiLineString') {
                if (newGeometry.length === 1) {
                    type = 'LineString';
                    newGeometry = newGeometry[0];
                } else {
                    type = 'MultiLineString';
                }
            }
            if (type === 'Point' || type === 'MultiPoint') {
                type = newGeometry.length === 3 ? 'Point' : 'MultiPoint';
            }

            clipped.push(createFeature(feature.id, type, newGeometry, feature.tags));
        }
    }

    return clipped.length ? clipped : null;
}

function clipPoints(geom, newGeom, k1, k2, axis) {
    for (var i = 0; i < geom.length; i += 3) {
        var a = geom[i + axis];

        if (a >= k1 && a <= k2) {
            newGeom.push(geom[i]);
            newGeom.push(geom[i + 1]);
            newGeom.push(geom[i + 2]);
        }
    }
}

function clipLine(geom, newGeom, k1, k2, axis, isPolygon, trackMetrics) {

    var slice;
    var intersect = axis === 0 ? intersectX : intersectY;
    var len = slice.start;

    for (var i = 0; i < geom.length - 3; i += 3) {
        var ax = geom[i];
        var ay = geom[i + 1];
        var az = geom[i + 2];
        var bx = geom[i + 3];
        var by = geom[i + 4];
        var a = axis === 0 ? ax : ay;
        var b = axis === 0 ? bx : by;
        var finishedSlice = false;

        if (trackMetrics) {
            var segLen = Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));
            len += segLen;
        }

        if (a < k1) {
            // Segment begins outside (to the left or below) the bounds.  If it
            // crosses into the bounds, take the intersection point as the
            // start of the slice.
            // Otherwise, it either ends on the _other_ side of the region
            // (handled below), or else it lies entirely outside (so we'll just
            // move on to the next point).

            // a   |    b   |
            // *---|--->*   |
            //     k1       k2
            if (b >= k1) {
                slice = newSlice(geom);
                var t = intersect(slice, ax, ay, bx, by, k1);
                if (trackMetrics) {
                    slice.start = len - segLen * t;
                }
            }
        } else if (a > k2) {
            // Same as above, but in the other direction: segment begins
            // outside to the right or above, and we check to see if it's
            // entering the bounds and thus beginning the slice.

            //     |    b   |    a
            //     |    *<--|----*
            //     k1       k2
            if (b <= k2) {
                slice = newSlice(geom);
                t = intersect(slice, ax, ay, bx, by, k2);
                if (trackMetrics) {
                    slice.start = len - segLen * t;
                }
            }
        } else {
            addPoint(slice, ax, ay, az);
        }

        if (b < k1 && a >= k1) {
            // Segment crosses from within bounds to outside (across the left
            // or bottom boundary).  Add the intersection as the end of this
            // slice.

            //   b  |    a   |            b  |        |    a
            //   *<-|----*   |        or  *<-|--------|----*
            //      k1       k2              k1       k2

            t = intersect(slice, ax, ay, bx, by, k1);
            if (trackMetrics) {
                slice.end = len - segLen * t;
            }
            finishedSlice = true;
        }
        if (b > k2 && a <= k2) {
            // Segment crosses from within bounds to outside (across the left
            // or bottom boundary).  Add the intersection as the end this slice.

            //      |    a   |   b        a  |        |    b
            //      |    *---|-->*    or  *--|--------|--->*
            //      k1       k2              k1       k2
            t = intersect(slice, ax, ay, bx, by, k2);
            if (trackMetrics) {
                slice.end = len - segLen * t;
            }
            finishedSlice = true;
        }

        if (!isPolygon && finishedSlice) {
            newGeom.push(slice);
        }
    }

    // add the last point
    if (!slice) slice = newSlice(geom);

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
    if (slice.length) {
        newGeom.push(slice);
    }
}

function newSlice(line) {
    var slice = [];
    slice.size = line.size;
    slice.start = line.start;
    slice.end = line.end;
    return slice;
}

function clipLines(geom, newGeom, k1, k2, axis, isPolygon) {
    for (var i = 0; i < geom.length; i++) {
        clipLine(geom[i], newGeom, k1, k2, axis, isPolygon, false);
    }
}

function addPoint(out, x, y, z) {
    out.push(x);
    out.push(y);
    out.push(z);
}

function intersectX(out, ax, ay, bx, by, x) {
    var t = (x - ax)  / (bx - ax);
    out.push(x);
    out.push(ay + (by - ay) * t);
    out.push(1);
    return 1 - Math.abs(t);
}

function intersectY(out, ax, ay, bx, by, y) {
    var t = (y - ay) / (by - ay);
    out.push(ax + (bx - ax) * t);
    out.push(y);
    out.push(1);
    return 1 - Math.abs(t);
}


import createFeature from './feature';

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

export default function clip(dimensions, features, scale, k1, k2, axis, minAll, maxAll, options) {

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
            clipPoints(dimensions, geometry, newGeometry, k1, k2, axis);

        } else if (type === 'LineString') {
            clipLine(dimensions, geometry, newGeometry, k1, k2, axis, false, options.lineMetrics);

        } else if (type === 'MultiLineString') {
            clipLines(dimensions, geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'Polygon') {
            clipLines(dimensions, geometry, newGeometry, k1, k2, axis, true);

        } else if (type === 'MultiPolygon') {
            for (var j = 0; j < geometry.length; j++) {
                var polygon = [];
                clipLines(dimensions, geometry[j], polygon, k1, k2, axis, true);
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

function clipPoints(dimensions, geom, newGeom, k1, k2, axis) {
    var stride = dimensions + 1;
    for (var i = 0; i < geom.length; i += stride) {
        var a = geom[i + axis];

        if (a >= k1 && a <= k2) {
            newGeom.push(geom[i]);
            newGeom.push(geom[i + 1]);
            newGeom.push(geom[i + 2]);
            if (dimensions === 3) newGeom.push(geom[i + 3]);
        }
    }
}

function clipLine(dimensions, geom, newGeom, k1, k2, axis, isPolygon, trackMetrics) {

    var slice = newSlice(geom);
    var intersect = axis === 0 ? intersectX : intersectY;
    var len = geom.start;
    var segLen, t;
    var stride = dimensions + 1;

    for (var i = 0; i < geom.length - stride; i += stride) {
        var ax = geom[i];
        var ay = geom[i + 1];
        var az = dimensions === 3 ? geom[i + 2] : null;
        var asimpl = geom[i + stride - 1];
        var bx = geom[i + stride];
        var by = geom[i + stride + 1];
        var bz = dimensions === 3 ? geom[i + 6] : null;
        var a = axis === 0 ? ax : ay;
        var b = axis === 0 ? bx : by;
        var exited = false;

        if (trackMetrics) segLen = dimensions === 3 ?
            Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2) + Math.pow(az - bz, 2)) :
            Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));

        if (a < k1) {
            // ---|-->  | (line enters the clip region from the left)
            if (b >= k1) {
                t = intersect(dimensions, slice, ax, ay, az, bx, by, bz, k1);
                if (trackMetrics) slice.start = len + segLen * t;
            }
        } else if (a > k2) {
            // |  <--|--- (line enters the clip region from the right)
            if (b <= k2) {
                t = intersect(dimensions, slice, ax, ay, az, bx, by, bz, k2);
                if (trackMetrics) slice.start = len + segLen * t;
            }
        } else {
            addPoint(dimensions, slice, ax, ay, az, asimpl);
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(dimensions, slice, ax, ay, az, bx, by, bz, k1);
            exited = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(dimensions, slice, ax, ay, az, bx, by, bz, k1);
            exited = true;
        }

        if (!isPolygon && exited) {
            if (trackMetrics) slice.end = len + segLen * t;
            newGeom.push(slice);
            slice = newSlice(geom);
        }

        if (trackMetrics) len += segLen;
    }

    // add the last point
    var last = geom.length - stride;
    ax = geom[last];
    ay = geom[last + 1];
    if (dimensions === 3) az = geom[last + 2];
    asimpl = geom[last + stride - 1];
    a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) addPoint(dimensions, slice, ax, ay, az, asimpl);

    // close the polygon if its endpoints are not the same after clipping
    last = slice.length - stride;
    if (isPolygon && last >= stride) {
        if (dimensions === 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1] || slice[last + 2] !== slice[2])) {
            addPoint(dimensions, slice, slice[0], slice[1], slice[2], slice[3]);
        } else if (slice[last] !== slice[0] || slice[last + 1] !== slice[1]) {
            // no z coordinate for 2 dimensional points
            addPoint(dimensions, slice, slice[0], slice[1], null, slice[2]);
        }
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

function clipLines(dimensions, geom, newGeom, k1, k2, axis, isPolygon) {
    for (var i = 0; i < geom.length; i++) {
        clipLine(dimensions, geom[i], newGeom, k1, k2, axis, isPolygon, false);
    }
}

function addPoint(dimensions, out, x, y, z, simpl) {
    out.push(x);
    out.push(y);
    if (dimensions === 3) out.push(z);
    out.push(simpl);
}

function intersectX(dimensions, out, ax, ay, az, bx, by, bz, x) {
    var t = (x - ax) / (bx - ax);
    out.push(x);
    out.push(ay + (by - ay) * t);
    if (dimensions === 3) out.push(az + (bz - az) * t);
    out.push(1);
    return t;
}

function intersectY(dimensions, out, ax, ay, az, bx, by, bz, y) {
    var t = (y - ay) / (by - ay);
    out.push(ax + (bx - ax) * t);
    out.push(y);
    if (dimensions === 3) out.push(az + (bz - az) * t);
    out.push(1);
    return t;
}

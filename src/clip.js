
import createFeature from './feature.js';

/* clip features between two vertical or horizontal axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 *
 * @param {*} features features to be clipped
 * @param {*} scale scaling of the axis
 * @param {*} k1 left/top edge of the given axis
 * @param {*} k2 right/bottom edge of the given axis
 * @param {*} axis 0 = x, 1 = y
 * @param {*} minAll minimum value on the given axis for all features
 * @param {*} maxAll maximum value on the given axis for all features
 * @param {*} options
*/
export default function clip(features, scale, k1, k2, axis, minAll, maxAll, options) {
    k1 /= scale;
    k2 /= scale;

    if (minAll >= k1 && maxAll < k2) return features; // trivial accept
    else if (maxAll < k1 || minAll >= k2) return null; // trivial reject

    const clipped = [];

    for (const feature of features) {
        const geometry = feature.geometry;
        const sqDist = feature.sqDist;
        let type = feature.type;

        const min = axis === 0 ? feature.minX : feature.minY;
        const max = axis === 0 ? feature.maxX : feature.maxY;

        if (min >= k1 && max < k2) { // trivial accept
            clipped.push(feature);
            continue;
        } else if (max < k1 || min >= k2) { // trivial reject
            continue;
        }

        let newGeometry = [];
        let newSqDist = [];

        if (type === 'Point' || type === 'MultiPoint') {
            clipPoints(geometry, newGeometry, k1, k2, axis);

        } else if (type === 'LineString') {
            clipLine(geometry, newGeometry, sqDist, newSqDist, k1, k2, axis, false, options.lineMetrics);

        } else if (type === 'MultiLineString') {
            clipLines(geometry, newGeometry, sqDist, newSqDist, k1, k2, axis, false);

        } else if (type === 'Polygon') {
            clipLines(geometry, newGeometry, sqDist, newSqDist, k1, k2, axis, true);

        } else if (type === 'MultiPolygon') {
            for (let i = 0; i < geometry.length; ++i) {
                const polygon = geometry[i];
                const sqDistPoly = sqDist[i];
                const newPolygon = [];
                const newSqDistPoly = [];
                clipLines(polygon, newPolygon, sqDistPoly, newSqDistPoly, k1, k2, axis, true);
                if (newPolygon.length) {
                    newGeometry.push(newPolygon);
                    newSqDist.push(newSqDistPoly);
                }
            }
        }

        if (newGeometry.length) {
            if (options.lineMetrics && type === 'LineString') {
                for (let i = 0; i < newGeometry.length; ++i) {
                    const line = newGeometry[i];
                    const lineSqDist = newSqDist[i];
                    clipped.push(createFeature(feature.id, type, line, lineSqDist, feature.tags));
                }
                continue;
            }

            if (type === 'LineString' || type === 'MultiLineString') {
                if (newGeometry.length === 1) {
                    type = 'LineString';
                    newGeometry = newGeometry[0];
                    newSqDist = newSqDist[0];
                } else {
                    type = 'MultiLineString';
                }
            }
            if (type === 'Point' || type === 'MultiPoint') {
                type = newGeometry.length === 3 ? 'Point' : 'MultiPoint';
            }

            clipped.push(createFeature(feature.id, type, newGeometry, newSqDist, feature.tags));
        }
    }

    return clipped.length ? clipped : null;
}

function clipPoints(geom, newGeom, k1, k2, axis) {
    for (let i = 0; i < geom.length; i += 3) {
        const a = geom[i + axis];

        if (a >= k1 && a <= k2) {
            addPoint(newGeom, geom[i], geom[i + 1], geom[i + 2]);
        }
    }
}

function clipLine(geom, newGeom, sqDist, newSqDist, k1, k2, axis, isPolygon, trackMetrics) {

    let slice = newSlice(geom);
    let sqDistSlice = [];
    const intersect = axis === 0 ? intersectX : intersectY;
    let len = geom.start;
    let segLen, t;

    for (let i = 0; i < geom.length - 3; i += 3) {
        const s = sqDist[i / 3];
        const ax = geom[i];
        const ay = geom[i + 1];
        const az = geom[i + 2];
        const bx = geom[i + 3];
        const by = geom[i + 4];
        const bz = geom[i + 5];
        const a = axis === 0 ? ax : ay;
        const b = axis === 0 ? bx : by;
        let exited = false;

        if (trackMetrics) segLen = Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));

        if (a < k1) {
            // ---|-->  | (line enters the clip region from the left/top)
            if (b > k1) {
                t = intersect(slice, ax, ay, az, bx, by, bz, k1);
                if (trackMetrics) slice.start = len + segLen * t;
                sqDistSlice.push(1);
            }
        } else if (a > k2) {
            // |  <--|--- (line enters the clip region from the right/bottom)
            if (b < k2) {
                t = intersect(slice, ax, ay, az, bx, by, bz, k2);
                if (trackMetrics) slice.start = len + segLen * t;
                sqDistSlice.push(1);
            }
        } else {
            addPoint(slice, ax, ay, az);
            sqDistSlice.push(s);
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(slice, ax, ay, az, bx, by, bz, k1);
            sqDistSlice.push(1);
            exited = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(slice, ax, ay, az, bx, by, bz, k2);
            sqDistSlice.push(1);
            exited = true;
        }

        if (!isPolygon && exited) {
            if (trackMetrics) slice.end = len + segLen * t;
            newGeom.push(slice);
            newSqDist.push(sqDistSlice);
            slice = newSlice(geom);
            sqDistSlice =  [];
        }

        if (trackMetrics) len += segLen;
    }

    // add the last point
    let last = geom.length - 3;
    const ax = geom[last];
    const ay = geom[last + 1];
    const az = geom[last + 2];
    const a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) {
        addPoint(slice, ax, ay, az);
        sqDistSlice.push(1);
    }

    // close the polygon if its endpoints are not the same after clipping
    last = slice.length - 3;
    if (isPolygon && last >= 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1])) {
        addPoint(slice, slice[0], slice[1], slice[2]);
        sqDistSlice.push(1);
    }

    // add the final slice
    if (slice.length) {
        newGeom.push(slice);
        newSqDist.push(sqDistSlice);
    }
}

function newSlice(line) {
    const slice = [];
    slice.size = line.size;
    slice.start = line.start;
    slice.end = line.end;
    return slice;
}

function clipLines(geom, newGeom, sqDist, newSqDist, k1, k2, axis, isPolygon) {
    for (let i = 0; i < geom.length; ++i) {
        const lineGeom = geom[i];
        const lineSqDist = sqDist[i];
        clipLine(lineGeom, newGeom, lineSqDist, newSqDist, k1, k2, axis, isPolygon, false);
    }
}

function addPoint(out, x, y, z) {
    out.push(x, y, z);
}

function intersectX(out, ax, ay, az, bx, by, bz, x) {
    const t = (x - ax) / (bx - ax);
    addPoint(out, x, ay + (by - ay) * t, az + (bz - az) * t);
    return t;
}

function intersectY(out, ax, ay, az, bx, by, bz, y) {
    const t = (y - ay) / (by - ay);
    addPoint(out, ax + (bx - ax) * t, y, az + (bz - az) * t);
    return t;
}

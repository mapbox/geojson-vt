
import createFeature from './feature.js';

/* clip features between two vertical or horizontal axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 *
 * k1 and k2 are the line coordinates
 * axis: 0 for x, 1 for y
 * minAll and maxAll: minimum and maximum coordinate value for all features
 */
export default function clip(features, scale, k1, k2, axis, minAll, maxAll, options) {
    const stride = (options.dimensions === undefined ? 2 : options.dimensions) + 1;
    k1 /= scale;
    k2 /= scale;

    if (minAll >= k1 && maxAll < k2) return features; // trivial accept
    else if (maxAll < k1 || minAll >= k2) return null; // trivial reject

    const clipped = [];

    for (const feature of features) {
        const geometry = feature.geometry;
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

        if (type === 'Point' || type === 'MultiPoint') {
            clipPoints(geometry, newGeometry, k1, k2, axis, stride);

        } else if (type === 'LineString') {
            clipLine(geometry, newGeometry, k1, k2, axis, false, options.lineMetrics, stride);

        } else if (type === 'MultiLineString') {
            clipLines(geometry, newGeometry, k1, k2, axis, false, stride);

        } else if (type === 'Polygon') {
            clipLines(geometry, newGeometry, k1, k2, axis, true, stride);

        } else if (type === 'MultiPolygon') {
            for (const polygon of geometry) {
                const newPolygon = [];
                clipLines(polygon, newPolygon, k1, k2, axis, true, stride);
                if (newPolygon.length) {
                    newGeometry.push(newPolygon);
                }
            }
        }

        if (newGeometry.length) {
            if (options.lineMetrics && type === 'LineString') {
                for (const line of newGeometry) {
                    clipped.push(createFeature(feature.id, type, line, feature.tags, feature.index, stride));
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
                type = newGeometry.length === stride ? 'Point' : 'MultiPoint';
            }

            clipped.push(createFeature(feature.id, type, newGeometry, feature.tags, feature.index, stride));
        }
    }

    return clipped.length ? clipped : null;
}

function clipPoints(geom, newGeom, k1, k2, axis, stride = 3) {
    for (let i = 0; i < geom.length; i += stride) {
        const a = geom[i + axis];

        if (a >= k1 && a <= k2) {
            addPoint(newGeom, geom[i], geom[i + 1], geom[i + 2]);
            for (let j = 3; j < stride; j++) {
                newGeom.push(geom[i + j]);
            }
        }
    }
}

function clipLine(geom, newGeom, k1, k2, axis, isPolygon, trackMetrics, stride = 3) {

    let slice = newSlice(geom);
    const intersect = axis === 0 ? intersectX : intersectY;
    let len = geom.start;
    let segLen, t;

    for (let i = 0; i < geom.length - stride; i += stride) {
        const ax = geom[i];
        const ay = geom[i + 1];
        const az = geom[i + 2];
        const bx = geom[i + stride];
        const by = geom[i + stride + 1];
        const a = axis === 0 ? ax : ay;
        const b = axis === 0 ? bx : by;
        let exited = false;

        if (trackMetrics) segLen = Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));

        if (a < k1) {
            // ---|-->  | (line enters the clip region from the left)
            if (b > k1) {
                t = intersect(slice, ax, ay, bx, by, k1);
                for (let j = 3; j < stride; j++) {
                    const aj = geom[i + j];
                    slice.push((geom[i + stride + j] - aj) * t + aj);
                }
                if (trackMetrics) slice.start = len + segLen * t;
            }
        } else if (a > k2) {
            // |  <--|--- (line enters the clip region from the right)
            if (b < k2) {
                t = intersect(slice, ax, ay, bx, by, k2);
                for (let j = 3; j < stride; j++) {
                    const aj = geom[i + j];
                    slice.push((geom[i + stride + j] - aj) * t + aj);
                }
                if (trackMetrics) slice.start = len + segLen * t;
            }
        } else {
            addPoint(slice, ax, ay, az);
            for (let j = 3; j < stride; j++) {
                slice.push(geom[i + j]);
            }
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(slice, ax, ay, bx, by, k1);
            for (let j = 3; j < stride; j++) {
                const aj = geom[i + j];
                slice.push((geom[i + stride + j] - aj) * t + aj);
            }
            exited = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(slice, ax, ay, bx, by, k2);
            for (let j = 3; j < stride; j++) {
                const aj = geom[i + j];
                slice.push((geom[i + stride + j] - aj) * t + aj);
            }
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
    let last = geom.length - stride;
    const ax = geom[last];
    const ay = geom[last + 1];
    const az = geom[last + 2];
    const a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) {
        addPoint(slice, ax, ay, az);
        for (let j = 3; j < stride; j++) {
            slice.push(geom[last + j]);
        }
    }

    // close the polygon if its endpoints are not the same after clipping
    last = slice.length - stride;
    if (isPolygon && last >= 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1])) {
        addPoint(slice, slice[0], slice[1], slice[2]);
        for (let j = 3; j < stride; j++) {
            slice.push(slice[j]);
        }
    }

    // add the final slice
    if (slice.length) {
        newGeom.push(slice);
    }
}

function newSlice(line) {
    const slice = [];
    slice.size = line.size;
    slice.start = line.start;
    slice.end = line.end;
    return slice;
}

function clipLines(geom, newGeom, k1, k2, axis, isPolygon, stride) {
    for (const line of geom) {
        clipLine(line, newGeom, k1, k2, axis, isPolygon, false, stride);
    }
}

function addPoint(out, x, y, z) {
    out.push(x, y, z);
}

function intersectX(out, ax, ay, bx, by, x) {
    const t = (x - ax) / (bx - ax);
    addPoint(out, x, ay + (by - ay) * t, 1);
    return t;
}

function intersectY(out, ax, ay, bx, by, y) {
    const t = (y - ay) / (by - ay);
    addPoint(out, ax + (bx - ax) * t, y, 1);
    return t;
}

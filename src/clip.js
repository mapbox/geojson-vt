
import createFeature, {POINT, LINE, POLYGON} from './feature.js';

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
    k1 /= scale;
    k2 /= scale;

    if (minAll >= k1 && maxAll < k2) return features; // trivial accept
    if (maxAll < k1 || minAll >= k2) return null;     // trivial reject

    const isMetrics = options.lineMetrics;
    const clipped = [];

    for (const feature of features) {
        const type = feature.type;
        const geometry = feature.geometry;

        const min = axis === 0 ? feature.minX : feature.minY;
        const max = axis === 0 ? feature.maxX : feature.maxY;

        if (min >= k1 && max < k2) { // trivial accept
            clipped.push(feature);
            continue;
        }
        if (max < k1 || min >= k2) continue; // trivial reject

        if (type === POINT) {
            const out = [];
            for (let i = 0; i < geometry.length; i += 3) {
                const a = geometry[i + axis];
                if (a >= k1 && a <= k2) out.push(geometry[i], geometry[i + 1], geometry[i + 2]);
            }
            if (out.length) clipped.push(createFeature(feature.id, POINT, out, feature.tags));
            continue;
        }

        const isPolygon = type === POLYGON;

        if (isMetrics && type === LINE) {
            // metrics features always have a single ring (split at convert/clip);
            // each output slice becomes its own feature with its own start/end.
            clipLine(geometry[0], clipped, k1, k2, axis, false, feature);
        } else {
            const out = [];
            for (const ring of geometry) clipLine(ring, out, k1, k2, axis, isPolygon, null);
            if (out.length) clipped.push(createFeature(feature.id, type, out, feature.tags));
        }
    }

    return clipped.length ? clipped : null;
}

// Sutherland–Hodgman clipping (for polygon rings) or split-into-segments
// (for linestrings). For polygons, pushes one clipped ring into `out`. For
// linestrings, pushes one ring per slice — and when `metricsSource` is set,
// pushes a full feature with start/end onto `out` instead.
function clipLine(geom, out, k1, k2, axis, isPolygon, metricsSource) {
    const trackMetrics = metricsSource !== null;
    let slice = newSlice(geom);
    const intersect = axis === 0 ? intersectX : intersectY;
    let len = trackMetrics ? metricsSource.start : 0;
    let sliceStart = len;
    let segLen, t;

    for (let i = 0; i < geom.length - 3; i += 3) {
        const ax = geom[i];
        const ay = geom[i + 1];
        const az = geom[i + 2];
        const bx = geom[i + 3];
        const by = geom[i + 4];
        const a = axis === 0 ? ax : ay;
        const b = axis === 0 ? bx : by;
        let exited = false;

        if (trackMetrics) segLen = Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));

        if (a < k1) {
            // ---|-->  | (line enters the clip region from the left)
            if (b >= k1) {
                t = intersect(slice, ax, ay, bx, by, k1);
                if (trackMetrics) sliceStart = len + segLen * t;
            }
        } else if (a > k2) {
            // |  <--|--- (line enters the clip region from the right)
            if (b <= k2) {
                t = intersect(slice, ax, ay, bx, by, k2);
                if (trackMetrics) sliceStart = len + segLen * t;
            }
        } else {
            slice.push(ax, ay, az);
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(slice, ax, ay, bx, by, k1);
            exited = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(slice, ax, ay, bx, by, k2);
            exited = true;
        }

        if (!isPolygon && exited) {
            if (trackMetrics) emitMetricsSlice(out, metricsSource, slice, sliceStart, len + segLen * t);
            else out.push(slice);
            slice = newSlice(geom);
        }

        if (trackMetrics) len += segLen;
    }

    // add the last point
    const last = geom.length - 3;
    const ax = geom[last];
    const ay = geom[last + 1];
    const az = geom[last + 2];
    const a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) slice.push(ax, ay, az);

    // close the polygon if its endpoints are not the same after clipping
    const lastOut = slice.length - 3;
    if (isPolygon && lastOut >= 3 && (slice[lastOut] !== slice[0] || slice[lastOut + 1] !== slice[1])) {
        slice.push(slice[0], slice[1], slice[2]);
    }

    // add the final slice
    if (slice.length) {
        if (trackMetrics) emitMetricsSlice(out, metricsSource, slice, sliceStart, len);
        else out.push(slice);
    }
}

function newSlice(line) {
    const slice = /** @type {number[] & {size: number}} */ ([]);
    slice.size = line.size;
    return slice;
}

function emitMetricsSlice(clipped, source, slice, start, end) {
    const f = createFeature(source.id, LINE, [slice], source.tags);
    f.start = start;
    f.end = end;
    clipped.push(f);
}

function intersectX(out, ax, ay, bx, by, x) {
    const t = (x - ax) / (bx - ax);
    out.push(x, ay + (by - ay) * t, 1);
    return t;
}

function intersectY(out, ax, ay, bx, by, y) {
    const t = (y - ay) / (by - ay);
    out.push(ax + (bx - ax) * t, y, 1);
    return t;
}


import {createFeature, POINT, LINE, POLYGON, SINGLE_POINT} from './feature.js';

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
    // Lazy-init: stay null while every feature so far trivially accepts. As
    // soon as any feature rejects or needs clipping, materialize `clipped`
    // by copying the accepted prefix. If the whole loop stays trivial-accept,
    // we return `features` directly and skip the Array allocation entirely.
    let clipped = null;

    for (let fi = 0; fi < features.length; fi++) {
        const feature = features[fi];
        const type = feature.type;

        if (type === SINGLE_POINT) {
            // x/y stored directly on the feature; no geometry array, no bbox.
            const a = axis === 0 ? feature.x : feature.y;
            if (a >= k1 && a <= k2) {
                if (clipped !== null) clipped.push(feature);
            } else if (clipped === null) {
                clipped = features.slice(0, fi);
            }
            continue;
        }

        const geometry = feature.geometry;

        const min = axis === 0 ? feature.minX : feature.minY;
        const max = axis === 0 ? feature.maxX : feature.maxY;

        if (min >= k1 && max < k2) { // trivial accept
            if (clipped !== null) clipped.push(feature);
            continue;
        }
        if (max < k1 || min >= k2) { // trivial reject
            if (clipped === null) clipped = features.slice(0, fi);
            continue;
        }
        if (clipped === null) clipped = features.slice(0, fi);

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
            const ringLen = geometry[0];
            const ringSize = geometry[1];
            clipRing(geometry, 2, 2 + ringLen * 3, ringSize, clipped, k1, k2, axis, false, feature);
        } else {
            const out = [];
            for (let i = 0; i < geometry.length;) {
                const ringLen = geometry[i];
                const ringSize = geometry[i + 1];
                const coords0 = i + 2;
                const coordsEnd = coords0 + ringLen * 3;
                clipRing(geometry, coords0, coordsEnd, ringSize, out, k1, k2, axis, isPolygon, null);
                i = coordsEnd;
            }
            if (out.length) clipped.push(createFeature(feature.id, type, out, feature.tags));
        }
    }

    if (clipped === null) return features; // every feature trivially accepted
    return clipped.length ? clipped : null;
}

// Sutherland–Hodgman clipping (for polygon rings) or split-into-segments
// (for linestrings). Reads one ring's coords from `geom[coords0..coordsEnd]`
// and writes inline-header ring(s) into `out`. For polygons: at most one
// output ring per input ring. For linestrings: any number of output rings.
// When `metricsSource` is set (line-metrics mode), each output slice is
// emitted as its own feature pushed into `out` instead — `out` is the
// `clipped` array of features in that case.
function clipRing(geom, coords0, coordsEnd, ringSize, out, k1, k2, axis, isPolygon, metricsSource) {
    const trackMetrics = metricsSource !== null;
    const intersect = axis === 0 ? intersectX : intersectY;

    // `slice` is the buffer we're currently writing coords into. In the normal
    // case it IS `out` (rings are appended sequentially into the shared geometry
    // buffer); in the metrics case it's a fresh per-slice buffer that becomes
    // its own feature when finalized.
    let slice = trackMetrics ? [] : out;
    let headerIdx = slice.length;
    slice.push(0, ringSize); // reserve [ringLen, ringSize]; ringLen backfilled below
    let sliceStart0 = slice.length;

    let len = trackMetrics ? metricsSource.start : 0;
    let sliceStart = len;
    let segLen, t;

    for (let i = coords0; i < coordsEnd - 3; i += 3) {
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
            // finalize current slice, start a new one
            finalizeSlice(slice, headerIdx, sliceStart0);
            if (trackMetrics) {
                emitMetricsSlice(out, metricsSource, slice, sliceStart, len + segLen * t);
                slice = [];
            }
            headerIdx = slice.length;
            slice.push(0, ringSize);
            sliceStart0 = slice.length;
        }

        if (trackMetrics) len += segLen;
    }

    // add the last point
    const last = coordsEnd - 3;
    const ax = geom[last];
    const ay = geom[last + 1];
    const az = geom[last + 2];
    const a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) slice.push(ax, ay, az);

    // close the polygon if its endpoints are not the same after clipping
    const lastIdx = slice.length - 3;
    if (isPolygon && lastIdx >= sliceStart0 + 3 &&
        (slice[lastIdx] !== slice[sliceStart0] || slice[lastIdx + 1] !== slice[sliceStart0 + 1])) {
        slice.push(slice[sliceStart0], slice[sliceStart0 + 1], slice[sliceStart0 + 2]);
    }

    // finalize the final slice
    if (finalizeSlice(slice, headerIdx, sliceStart0) && trackMetrics) {
        emitMetricsSlice(out, metricsSource, slice, sliceStart, len);
    }
}

// Backfill ringLen, or roll back the reserved header if the slice is empty.
// Returns whether a non-empty slice was written.
function finalizeSlice(slice, headerIdx, coords0) {
    const ringLen = (slice.length - coords0) / 3;
    if (ringLen > 0) {
        slice[headerIdx] = ringLen;
        return true;
    }
    slice.length = headerIdx;
    return false;
}

function emitMetricsSlice(clipped, source, slice, start, end) {
    const f = createFeature(source.id, LINE, slice, source.tags);
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

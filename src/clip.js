
import {createFeature, POINT, LINE, POLYGON, SINGLE_POINT, KEEP_Z} from './feature.js';

/** @import {AnyFeature, Feature, CoordArray, CoordArrayCtor, InternalOptions as Options} from './internal.d.ts' */

/* clip features between two vertical or horizontal axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 *
 * k1, k2: storage-space clip-line coordinates (caller has already converted
 *         from tile-grid units, multiplied by worldScale, shifted by
 *         originShift). Same scale as feature coords.
 * axis: 0 for x, 1 for y
 * minAll, maxAll: storage-space bbox bounds across all features
 */
/** @param {AnyFeature[]} features @param {number} k1 @param {number} k2 @param {0|1} axis @param {number} minAll @param {number} maxAll @param {Options} options @returns {AnyFeature[]|null} */
export default function clip(features, k1, k2, axis, minAll, maxAll, options) {
    if (minAll >= k1 && maxAll < k2) return features; // trivial accept
    if (maxAll < k1 || minAll >= k2) return null;     // trivial reject

    const isMetrics = options.lineMetrics;
    const CoordArray = options.CoordArray;
    // Lazy-init: stay null while every feature so far trivially accepts. As soon as any feature rejects
    // or needs clipping, materialize `clipped` by copying the accepted prefix.
    /** @type {AnyFeature[]|null} */
    let clipped = null;

    for (let fi = 0; fi < features.length; fi++) {
        const feature = features[fi];
        const type = feature.type;

        if (type === SINGLE_POINT) {
            // x/y stored directly on the feature; no geometry array, no bbox.
            const a = axis === 0 ? feature.x : feature.y;
            if (a >= k1 && a < k2) {
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
            clipPoint(geometry, k1, k2, axis, feature, clipped, CoordArray);
            continue;
        }
        clipLinesOrPolygons(geometry, type, k1, k2, axis, feature, clipped, isMetrics, CoordArray);
    }

    if (clipped === null) return features; // every feature trivially accepted
    return clipped.length ? clipped : null;
}

/** @param {CoordArray} geometry @param {number} k1 @param {number} k2 @param {0|1} axis @param {Feature} feature @param {AnyFeature[]} clipped @param {CoordArrayCtor} CoordArray */
function clipPoint(geometry, k1, k2, axis, feature, clipped, CoordArray) {
    let n = 0;
    for (let i = 0; i < geometry.length; i += 3) {
        if (geometry[i + axis] >= k1 && geometry[i + axis] < k2) n += 3;
    }
    if (n === 0) return;
    const out = new CoordArray(n);
    let w = 0;
    for (let i = 0; i < geometry.length; i += 3) {
        if (geometry[i + axis] >= k1 && geometry[i + axis] < k2) {
            out[w]     = geometry[i];
            out[w + 1] = geometry[i + 1];
            out[w + 2] = geometry[i + 2];
            w += 3;
        }
    }
    clipped.push(createFeature(feature.id, POINT, out, feature.tags));
}

/** @param {CoordArray} geometry @param {1|2|3} type @param {number} k1 @param {number} k2 @param {0|1} axis @param {Feature} feature @param {AnyFeature[]} clipped @param {boolean} isMetrics @param {CoordArrayCtor} CoordArray */
function clipLinesOrPolygons(geometry, type, k1, k2, axis, feature, clipped, isMetrics, CoordArray) {
    const isPolygon = type === POLYGON;

    // Two passes: precount the exact output size, then allocate once and write all rings/slices into a
    // single inline-header buffer.
    let total = 0;
    for (let i = 0; i < geometry.length;) {
        const coordsEnd = i + 2 + geometry[i] * 3;
        total += countClipRing(geometry, i + 2, coordsEnd, k1, k2, axis, isPolygon);
        i = coordsEnd;
    }
    if (total === 0) return;

    let out = new CoordArray(total);
    // Interpolated coords are rounded only into integer storage, where the array would otherwise truncate
    // them toward zero. Float64 storage is the uncentered [0, 1] source space, where rounding would snap
    // every intersection to a world corner.
    const round = CoordArray === Int32Array;
    // line-metrics mode collects a (start, end) pair per emitted slice; such features always have a single ring
    const metrics = isMetrics && type === LINE ? /** @type {number[]} */ ([]) : null;
    let w = 0;
    for (let i = 0; i < geometry.length;) {
        const coordsEnd = i + 2 + geometry[i] * 3;
        w = clipRing(geometry, i + 2, coordsEnd, geometry[i + 1], out, w, k1, k2, axis, isPolygon, round, metrics, feature.start || 0);
        i = coordsEnd;
    }

    // The polygon precount reserves a closing point whenever a ring crossed a clip line, but the ring is only
    // closed when its endpoints differ, so the buffer may have unused slack at the end: trim it away.
    if (w < total) out = out.subarray(0, w);

    if (metrics === null) {
        clipped.push(createFeature(feature.id, type, out, feature.tags));
        return;
    }
    // split the packed slices into separate features so each carries its own metrics
    for (let i = 0, n = 0; i < out.length; n += 2) {
        const coordsEnd = i + 2 + out[i] * 3;
        const f = createFeature(feature.id, LINE, out.slice(i, coordsEnd), feature.tags);
        f.start = metrics[n];
        f.end = metrics[n + 1];
        clipped.push(f);
        i = coordsEnd;
    }
}

// Count exact output slot count (headers + coords) for one input ring, mirroring `clipRing`'s topology without
// intersect math. The polygon-close decision uses the crossing count: close is needed iff at least one segment
// crossed a clip line (the output then ends in an intersection, differing from the entry point). Zero crossings
// means the ring is verbatim-copied and remains naturally closed.
/** @param {CoordArray} geom @param {number} coords0 @param {number} coordsEnd @param {number} k1 @param {number} k2 @param {0|1} axis @param {boolean} isPolygon */
function countClipRing(geom, coords0, coordsEnd, k1, k2, axis, isPolygon) {
    let slices = 0;
    let coordsTotal = 0;
    let sliceCoords = 0;
    let crossings = 0;

    for (let i = coords0; i < coordsEnd - 3; i += 3) {
        const a = geom[i + axis];
        const b = geom[i + 3 + axis];
        let exited = false;

        if (a < k1) {
            if (b >= k1) { sliceCoords++; crossings++; }
        } else if (a > k2) {
            if (b <= k2) { sliceCoords++; crossings++; }
        } else {
            sliceCoords++;
        }
        if (b < k1 && a >= k1) { sliceCoords++; crossings++; exited = true; }
        if (b > k2 && a <= k2) { sliceCoords++; crossings++; exited = true; }

        if (!isPolygon && exited) {
            if (sliceCoords > 0) {
                coordsTotal += sliceCoords;
                slices++;
            }
            sliceCoords = 0;
        }
    }

    const lastA = geom[coordsEnd - 3 + axis];
    if (lastA >= k1 && lastA <= k2) sliceCoords++;
    if (isPolygon && sliceCoords >= 2 && crossings >= 1) sliceCoords++;

    if (sliceCoords > 0) {
        coordsTotal += sliceCoords;
        slices++;
    }

    return coordsTotal * 3 + slices * 2;
}

// Sutherland–Hodgman clipping (for polygon rings) or split-into-segments (for linestrings). Reads one ring's
// coords from `geom[coords0..coordsEnd]` and writes inline-header ring(s) into `out` starting at writer
// position `w`. For polygons: at most one output ring per input ring; for linestrings: any number. Returns `w`.
// In line-metrics mode `metrics` receives a (start, end) pair per emitted slice, measured from `start`.
/** @param {CoordArray} geom @param {number} coords0 @param {number} coordsEnd @param {number} ringSize @param {CoordArray} out @param {number} w @param {number} k1 @param {number} k2 @param {0|1} axis @param {boolean} isPolygon @param {boolean} round @param {number[]|null} metrics @param {number} start */
function clipRing(geom, coords0, coordsEnd, ringSize, out, w, k1, k2, axis, isPolygon, round, metrics, start) {
    const trackMetrics = metrics !== null;
    let headerIdx = w;
    out[w]     = 0;        // ringLen, backfilled below
    out[w + 1] = ringSize;
    w += 2;
    let sliceWriteStart = w;

    let len = start;
    let sliceMetricStart = len;
    let segLen = 0, t = 0;

    for (let i = coords0; i < coordsEnd - 3; i += 3) {
        const ax = geom[i];
        const ay = geom[i + 1];
        const az = geom[i + 2];
        const bx = geom[i + 3];
        const by = geom[i + 4];
        const a = axis === 0 ? ax : ay;
        const b = axis === 0 ? bx : by;
        let exited = false;

        if (trackMetrics) segLen = Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

        if (a < k1) {
            // ---|-->  | (line enters the clip region from the left)
            if (b >= k1) {
                t = intersect(out, w, ax, ay, bx, by, k1, axis, round); w += 3;
                if (trackMetrics) sliceMetricStart = len + segLen * t;
            }
        } else if (a > k2) {
            // |  <--|--- (line enters the clip region from the right)
            if (b <= k2) {
                t = intersect(out, w, ax, ay, bx, by, k2, axis, round); w += 3;
                if (trackMetrics) sliceMetricStart = len + segLen * t;
            }
        } else {
            out[w]     = ax;
            out[w + 1] = ay;
            out[w + 2] = az;
            w += 3;
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(out, w, ax, ay, bx, by, k1, axis, round); w += 3;
            exited = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(out, w, ax, ay, bx, by, k2, axis, round); w += 3;
            exited = true;
        }

        if (!isPolygon && exited) {
            // finalize current slice, start a new one
            const sliceLen = (w - sliceWriteStart) / 3;
            if (sliceLen > 0) {
                out[headerIdx] = sliceLen;
                if (trackMetrics) /** @type {number[]} */ (metrics).push(sliceMetricStart, len + segLen * t);
                headerIdx = w;
                out[w]     = 0;
                out[w + 1] = ringSize;
                w += 2;
                sliceWriteStart = w;
            }
            // else: empty slice; reuse the reserved header for the next one
        }

        if (trackMetrics) len += segLen;
    }

    // add the last point
    const last = coordsEnd - 3;
    const ax = geom[last];
    const ay = geom[last + 1];
    const az = geom[last + 2];
    const a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) {
        out[w]     = ax;
        out[w + 1] = ay;
        out[w + 2] = az;
        w += 3;
    }

    // close the polygon if its endpoints are not the same after clipping
    if (isPolygon && (w - sliceWriteStart) >= 6 &&
        (out[w - 3] !== out[sliceWriteStart] || out[w - 2] !== out[sliceWriteStart + 1])) {
        out[w]     = out[sliceWriteStart];
        out[w + 1] = out[sliceWriteStart + 1];
        out[w + 2] = out[sliceWriteStart + 2];
        w += 3;
    }

    // finalize the final slice — backfill ringLen, or roll back the reserved
    // header if the slice ended up empty
    const sliceLen = (w - sliceWriteStart) / 3;
    if (sliceLen > 0) {
        out[headerIdx] = sliceLen;
        if (trackMetrics) /** @type {number[]} */ (metrics).push(sliceMetricStart, len);
    } else {
        w = headerIdx;
    }

    return w;
}

// Compute the segment/clip-line intersection point at axis-parallel value `k`, write its (x, y, z=KEEP) triple
// into `out` at position `w`, and return parametric `t` for the metrics path. The axis component is `k` itself;
// the non-axis component is a real intersection, rounded to the nearest quantum when `round` is set so that
// integer storage doesn't truncate it toward zero. The KEEP sentinel keeps the point out of simplification.
/** @param {CoordArray} out @param {number} w @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} k @param {0|1} axis @param {boolean} round @returns {number} */
function intersect(out, w, ax, ay, bx, by, k, axis, round) {
    let t;
    if (axis === 0) {
        t = (k - ax) / (bx - ax);
        const y = ay + (by - ay) * t;
        out[w]     = k;
        out[w + 1] = round ? Math.round(y) : y;
    } else {
        t = (k - ay) / (by - ay);
        const x = ax + (bx - ax) * t;
        out[w]     = round ? Math.round(x) : x;
        out[w + 1] = k;
    }
    out[w + 2] = KEEP_Z;
    return t;
}


import {createFeature, POINT, LINE, POLYGON, SINGLE_POINT} from './feature.js';

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
export default function clip(features, k1, k2, axis, minAll, maxAll, options) {
    if (minAll >= k1 && maxAll < k2) return features; // trivial accept
    if (maxAll < k1 || minAll >= k2) return null;     // trivial reject

    const isMetrics = options.lineMetrics;
    const CoordArray = options.CoordArray;
    // Lazy-init: stay null while every feature so far trivially accepts. As
    // soon as any feature rejects or needs clipping, materialize `clipped`
    // by copying the accepted prefix.
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
            clipPoint(geometry, k1, k2, axis, feature, clipped, CoordArray);
            continue;
        }
        clipLinesOrPolygons(geometry, type, k1, k2, axis, feature, clipped, isMetrics, CoordArray);
    }

    if (clipped === null) return features; // every feature trivially accepted
    return clipped.length ? clipped : null;
}

function clipPoint(geometry, k1, k2, axis, feature, clipped, CoordArray) {
    let n = 0;
    for (let i = 0; i < geometry.length; i += 3) {
        if (geometry[i + axis] >= k1 && geometry[i + axis] <= k2) n += 3;
    }
    if (n === 0) return;
    const out = new CoordArray(n);
    let w = 0;
    for (let i = 0; i < geometry.length; i += 3) {
        if (geometry[i + axis] >= k1 && geometry[i + axis] <= k2) {
            out[w]     = geometry[i];
            out[w + 1] = geometry[i + 1];
            out[w + 2] = geometry[i + 2];
            w += 3;
        }
    }
    clipped.push(createFeature(feature.id, POINT, out, feature.tags));
}

function clipLinesOrPolygons(geometry, type, k1, k2, axis, feature, clipped, isMetrics, CoordArray) {
    const isPolygon = type === POLYGON;
    const trackMetrics = isMetrics && type === LINE;

    // Two passes: precount exact output sizes, then allocate and write.
    // Metrics mode produces one feature per slice (sized individually);
    // non-metrics packs all rings into a single inline-header buffer.
    if (trackMetrics) {
        // metrics features always have a single ring (split at convert/clip);
        // each output slice becomes its own feature with its own start/end.
        const ringLen = geometry[0];
        const ringSize = geometry[1];
        const sliceSizes = [];
        countClipRing(geometry, 2, 2 + ringLen * 3, k1, k2, axis, false, sliceSizes);
        if (sliceSizes.length === 0) return;
        const out = new CoordArray(2 + sliceSizes[0] * 3);
        clipRing(geometry, 2, 2 + ringLen * 3, ringSize, out, 0, k1, k2, axis, false, feature, sliceSizes, clipped, CoordArray);
        return;
    }

    let total = 0;
    for (let i = 0; i < geometry.length;) {
        const ringLen = geometry[i];
        const coordsEnd = i + 2 + ringLen * 3;
        total += countClipRing(geometry, i + 2, coordsEnd, k1, k2, axis, isPolygon, null);
        i = coordsEnd;
    }
    if (total === 0) return;
    const out = new CoordArray(total);
    let w = 0;
    for (let i = 0; i < geometry.length;) {
        const ringLen = geometry[i];
        const ringSize = geometry[i + 1];
        const coordsEnd = i + 2 + ringLen * 3;
        w = clipRing(geometry, i + 2, coordsEnd, ringSize, out, w, k1, k2, axis, isPolygon, null, null, null, CoordArray);
        i = coordsEnd;
    }
    clipped.push(createFeature(feature.id, type, out, feature.tags));
}

// Count exact output slot count (headers + coords) for one input ring,
// mirroring `clipRing`'s topology without intersect math. The polygon-close
// decision uses the crossing count: for valid closed input rings, close is
// needed iff at least one segment crossed a clip line (the output then ends
// in an intersection, which differs from the entry point). Zero crossings
// means the ring is verbatim-copied and remains naturally closed. When
// `sliceSizes` is provided (metrics mode), per-slice coord counts are
// pushed into it instead of summed; the return value is then irrelevant.
function countClipRing(geom, coords0, coordsEnd, k1, k2, axis, isPolygon, sliceSizes) {
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
                if (sliceSizes !== null) sliceSizes.push(sliceCoords);
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
        if (sliceSizes !== null) sliceSizes.push(sliceCoords);
        coordsTotal += sliceCoords;
        slices++;
    }

    return coordsTotal * 3 + slices * 2;
}

// Sutherland–Hodgman clipping (for polygon rings) or split-into-segments
// (for linestrings). Reads one ring's coords from `geom[coords0..coordsEnd]`
// and writes inline-header ring(s) into `out` starting at writer position
// `w`. For polygons: at most one output ring per input ring. For linestrings:
// any number of output rings. Returns the new `w`.
//
// When `metricsSource` is set (line-metrics mode), each finalized slice is
// instead emitted as its own feature into `clipped`, and `out` is swapped to
// the next slice's exact-sized buffer (per `sliceSizes`, produced by the
// precount). In that mode the returned `w` is meaningless.
function clipRing(geom, coords0, coordsEnd, ringSize, out, w, k1, k2, axis, isPolygon, metricsSource, sliceSizes, clipped, CoordArray) {
    const trackMetrics = metricsSource !== null;
    let sliceIdx = 0;
    let headerIdx = w;
    out[w]     = 0;        // ringLen, backfilled below
    out[w + 1] = ringSize;
    w += 2;
    let sliceStart0 = w;

    let len = trackMetrics ? metricsSource.start : 0;
    let sliceStart = len;
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
                t = intersect(out, w, ax, ay, bx, by, k1, axis); w += 3;
                if (trackMetrics) sliceStart = len + segLen * t;
            }
        } else if (a > k2) {
            // |  <--|--- (line enters the clip region from the right)
            if (b <= k2) {
                t = intersect(out, w, ax, ay, bx, by, k2, axis); w += 3;
                if (trackMetrics) sliceStart = len + segLen * t;
            }
        } else {
            out[w]     = ax;
            out[w + 1] = ay;
            out[w + 2] = az;
            w += 3;
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(out, w, ax, ay, bx, by, k1, axis); w += 3;
            exited = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(out, w, ax, ay, bx, by, k2, axis); w += 3;
            exited = true;
        }

        if (!isPolygon && exited) {
            // finalize current slice, start a new one
            const sliceLen = (w - sliceStart0) / 3;
            if (sliceLen > 0) {
                out[headerIdx] = sliceLen;
                if (trackMetrics) {
                    emitMetricsSlice(clipped, metricsSource, out, sliceStart, len + segLen * t);
                    sliceIdx++;
                    if (sliceIdx < sliceSizes.length) {
                        out = new CoordArray(2 + sliceSizes[sliceIdx] * 3);
                        w = 0;
                    }
                }
                headerIdx = w;
                out[w]     = 0;
                out[w + 1] = ringSize;
                w += 2;
                sliceStart0 = w;
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
    if (isPolygon && (w - sliceStart0) >= 6 &&
        (out[w - 3] !== out[sliceStart0] || out[w - 2] !== out[sliceStart0 + 1])) {
        out[w]     = out[sliceStart0];
        out[w + 1] = out[sliceStart0 + 1];
        out[w + 2] = out[sliceStart0 + 2];
        w += 3;
    }

    // finalize the final slice — backfill ringLen, or roll back the reserved
    // header if the slice ended up empty
    const sliceLen = (w - sliceStart0) / 3;
    if (sliceLen > 0) {
        out[headerIdx] = sliceLen;
        if (trackMetrics) emitMetricsSlice(clipped, metricsSource, out, sliceStart, len);
    } else {
        w = headerIdx;
    }

    return w;
}

function emitMetricsSlice(clipped, source, geom, start, end) {
    const f = createFeature(source.id, LINE, geom, source.tags);
    f.start = start;
    f.end = end;
    clipped.push(f);
}

// Compute the segment/clip-line intersection point at axis-parallel value `k`,
// write its (x, y, z=KEEP) triple into `out` at position `w`, and return the
// parametric `t` along the segment for the metrics path's start/end.
// `k` is integer-valued in storage space (axis component falls on a
// quantum-aligned clip line); the non-axis component is a real intersection
// that Int32Array auto-coerces on store. The KEEP sentinel ensures the
// intersection is never simplified away.
function intersect(out, w, ax, ay, bx, by, k, axis) {
    let t;
    if (axis === 0) {
        t = (k - ax) / (bx - ax);
        out[w]     = k;
        out[w + 1] = Math.round(ay + (by - ay) * t);
    } else {
        t = (k - ay) / (by - ay);
        out[w]     = Math.round(ax + (bx - ax) * t);
        out[w + 1] = k;
    }
    out[w + 2] = 0x7FFFFFFF;
    return t;
}

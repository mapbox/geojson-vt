
import simplify from './simplify.js';
import {createFeature, createSinglePoint, POINT, LINE, POLYGON, KEEP_Z} from './feature.js';

/** @import {AnyFeature, CoordArray, InternalOptions as Options, Tags, FeatureId as Id} from './internal.d.ts' */
/** @import {Feature, GeoJSON} from 'geojson' */

// Converts a GeoJSON feature into an intermediate projected JSON vector format with simplification data.
//
// Source coords are projected once here into "storage space" and stay there through clip / wrap / tile.
// Storage space is parameterized by the Int32 gating on options:
//   - useInt32 = true: coords centered and scaled to integer maxZoom-pixel quanta, rounded to nearest
//     before the Int32Array store (spec ToInt32 would truncate toward zero, which is a half-quantum bias
//     versus the Math.round that tile projection and downstream consumers use). The world [0, 1] source-x
//     → storage [-W/2, W/2] where W = extent * 2^maxZoom.
//   - useInt32 = false: storage = source ([0, 1] uncentered), stored in Float64Array unrounded.
//     Equivalent to the historical encoding.
// Single Points are kept unquantized on both paths: they live in plain object fields, not a typed array.
// The z-slot (simplification weight) and POLYGON ringSize are stored sqrt-linear so they stay in Int32 range
// and tile.js's keep-or-drop comparison is `> tolerance` (linear) for both paths.

const INVALID_GEOJSON = 'Input data is not a valid GeoJSON object.';

/** @param {GeoJSON} data @param {Options} options @returns {AnyFeature[]} */
export default function convert(data, options) {
    /** @type {AnyFeature[]} */
    const features = [];
    if (data.type === 'FeatureCollection') {
        for (let i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], options, i);
        }
    } else if (data.type === 'Feature') {
        convertFeature(features, data, options);
    } else {
        // bare geometry (incl. GeometryCollection): wrap in a Feature so the recursion sees a uniform shape
        convertFeature(features, {type: 'Feature', geometry: data, properties: null}, options);
    }
    return features;
}

/** @param {AnyFeature[]} features @param {Feature} geojson @param {Options} options @param {number} [index] */
function convertFeature(features, geojson, options, index) {
    const geom = geojson.geometry;
    if (!geom) return;
    // GeometryCollection has `geometries` instead of `coordinates`. Absent either way means malformed
    // input, including an unrecognized type, which is how that reaches the error below.
    const parts = geom.type === 'GeometryCollection' ? geom.geometries : geom.coordinates;
    if (!parts) throw new Error(INVALID_GEOJSON);
    if (!parts.length) return;

    // tolerance is given in pixels-at-tile-extent; convert to storage-space distance at maxZoom
    // and square it for simplify's internal comparison.
    const tolerance = options.tolerance * options.worldScale / ((1 << options.maxZoom) * options.extent);
    const sqTolerance = tolerance * tolerance;
    const tags = geojson.properties;
    const CoordArray = options.CoordArray;
    const S = options.worldScale;
    const O = options.originShift;
    const R = options.useInt32;

    let id = geojson.id;
    if (options.promoteId) id = geojson.properties?.[options.promoteId];
    else if (options.generateId) id = index || 0;

    if (geom.type === 'Point') {
        features.push(createSinglePoint(id, projectX(geom.coordinates[0], S, O), projectY(geom.coordinates[1], S, O), tags));

    } else if (geom.type === 'MultiPoint') {
        const coords = geom.coordinates;
        const out = new CoordArray(coords.length * 3);
        for (let i = 0; i < coords.length; i++) {
            out[i * 3]     = quantize(projectX(coords[i][0], S, O), R);
            out[i * 3 + 1] = quantize(projectY(coords[i][1], S, O), R);
        }
        pushFeature(features, id, POINT, out, tags, options);

    } else if (geom.type === 'LineString') {
        pushLine(features, id, geom.coordinates, tags, sqTolerance, options);

    } else if (geom.type === 'MultiLineString' && options.lineMetrics) {
        // explode into separate features so each carries its own metrics
        for (const lineCoords of geom.coordinates) pushLine(features, id, lineCoords, tags, sqTolerance, options);

    } else if (geom.type === 'MultiLineString' || geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
        // MultiLineString and Polygon are a single group of rings; MultiPolygon is several. All rings of a feature
        // are flattened into one buffer: for polygons, the first ring of each group is outer (per GeoJSON spec) and
        // the rest are holes, distinguished after canonical winding by the sign of ringSize.
        const isPolygon = geom.type !== 'MultiLineString';
        const groups = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
        let total = 0;
        for (const rings of groups) total += ringsBufferSize(rings);
        const out = new CoordArray(total);
        let idx = 0;
        for (const rings of groups) {
            for (let i = 0; i < rings.length; i++) {
                idx = writeLine(out, idx, rings[i], sqTolerance, isPolygon, isPolygon && i === 0, S, O, R);
            }
        }
        pushFeature(features, id, isPolygon ? POLYGON : LINE, out, tags, options);

    } else if (geom.type === 'GeometryCollection') {
        for (const g of geom.geometries) {
            convertFeature(features, {type: 'Feature', id, geometry: g, properties: geojson.properties}, options, index);
        }
    } else {
        throw new Error(INVALID_GEOJSON);
    }
}

/** @param {number[][][]} rings */
function ringsBufferSize(rings) {
    let n = 0;
    for (const ring of rings) if (ring.length > 0) n += 2 + ring.length * 3;
    return n;
}

/** @param {AnyFeature[]} features @param {Id|undefined} id @param {1|2|3} type @param {CoordArray} geom @param {Tags} tags @param {Options} options */
function pushFeature(features, id, type, geom, tags, options) {
    const feature = createFeature(id, type, geom, tags);
    if (type === LINE && options.lineMetrics) {
        feature.start = 0;
        feature.end = geom[1]; // first ring's ringSize (line length)
    }
    features.push(feature);
}

/** @param {AnyFeature[]} features @param {Id|undefined} id @param {number[][]} coords @param {Tags} tags @param {number} sqTolerance @param {Options} options */
function pushLine(features, id, coords, tags, sqTolerance, options) {
    const out = new options.CoordArray(2 + coords.length * 3);
    writeLine(out, 0, coords, sqTolerance, false, false, options.worldScale, options.originShift, options.useInt32);
    pushFeature(features, id, LINE, out, tags, options);
}

// Write one ring (header + coords) at `idx` into the pre-sized geometry buffer. Returns the next write position.
// `ringSize` is stored sqrt-linear for POLYGON (sign(area) * sqrt(|area|)) and linear length for LINE —
// both stay in Int32 range at the worst-case world span.
/** @param {CoordArray} out @param {number} idx @param {number[][]} ring @param {number} sqTolerance @param {boolean} isPolygon @param {boolean} isOuter @param {number} S @param {number} O @param {boolean} R @returns {number} */
function writeLine(out, idx, ring, sqTolerance, isPolygon, isOuter, S, O, R) {
    // empty rings are skipped at the call sites; this guard prevents KEEP_Z scribbling past the reserved header into the next ring
    if (ring.length === 0) return idx;
    const headerIdx = idx;
    idx += 2; // reserve [ringLen, ringSize]; backfilled below
    const coords0 = idx;

    let x0 = 0, y0 = 0;
    let size = 0;

    for (let j = 0; j < ring.length; j++) {
        // quantized before the size accumulation so ringSize describes the geometry actually stored
        const x = quantize(projectX(ring[j][0], S, O), R);
        const y = quantize(projectY(ring[j][1], S, O), R);

        out[idx]     = x;
        out[idx + 1] = y;
        idx += 3;

        if (j > 0) {
            if (isPolygon) {
                size += (x0 * y - x * y0) / 2; // signed area (storage² units; Float64 intermediate)
            } else {
                const dx = x - x0, dy = y - y0;
                size += Math.sqrt(dx * dx + dy * dy); // length (storage units)
            }
        }
        x0 = x;
        y0 = y;
    }

    const coordsEnd = idx;

    // canonical winding: outer rings get one orientation, holes the opposite, determined structurally
    // from GeoJSON nesting (not from input winding)
    if (isPolygon && ((isOuter && size < 0) || (!isOuter && size >= 0))) {
        const nCoords = coordsEnd - coords0;
        for (let k = 0; k < nCoords / 2; k += 3) {
            const i = coords0 + k;
            const j = coordsEnd - 3 - k;
            const x = out[i];
            const y = out[i + 1];
            const z = out[i + 2];
            out[i]     = out[j];
            out[i + 1] = out[j + 1];
            out[i + 2] = out[j + 2];
            out[j]     = x;
            out[j + 1] = y;
            out[j + 2] = z;
        }
        size = -size; // sign now matches canonical winding (outer positive, hole negative)
    }

    const lastIdx = coordsEnd - 3;
    out[coords0 + 2] = KEEP_Z;
    simplify(out, coords0, lastIdx, sqTolerance);
    out[lastIdx + 2] = KEEP_Z;

    // backfill header. POLYGON: sign(area)*sqrt(|area|) — keeps sign for outer/hole distinction, fits Int32
    // since |area| ≤ W², sqrt ≤ W ≤ 2^32. LINE: linear length (already in storage units).
    out[headerIdx] = (coordsEnd - coords0) / 3;
    out[headerIdx + 1] = isPolygon ? Math.sign(size) * Math.sqrt(Math.abs(size)) : size;

    return idx;
}

// Round-half-up to the storage quantum on the Int32 path; identity on the Float64 path. Bit-identical to
// Math.round for coordinate magnitudes, but Math.floor compiles to a single instruction where Math.round
// is a builtin call — Math.round here cost +27–34% on convert for polygon datasets, this variant is free.
/** @param {number} v @param {boolean} R */
function quantize(v, R) {
    return R ? Math.floor(v + 0.5) : v;
}

/** @param {number} x @param {number} S @param {number} O */
function projectX(x, S, O) {
    return (x / 360 + 0.5 - O) * S;
}

/** @param {number} y @param {number} S @param {number} O */
function projectY(y, S, O) {
    const sin = Math.sin(y * Math.PI / 180);
    const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    const yc = y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
    return (yc - O) * S;
}

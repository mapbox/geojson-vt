
import simplify from './simplify.js';
import {createFeature, createSinglePoint, POINT, LINE, POLYGON} from './feature.js';

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data.
//
// Source coords are projected once here into "storage space" and stay there
// through clip / wrap / tile. Storage space is parameterized by the Int32
// gating on options:
//   - useInt32 = true: coords centered and scaled to integer maxZoom-pixel
//     quanta. The world [0, 1] source-x → storage [-W/2, W/2] where
//     W = extent * 2^maxZoom. Values stored in Int32Array; spec ToInt32
//     coerces on assignment (no explicit Math.round at call sites).
//   - useInt32 = false: storage = source ([0, 1] uncentered), stored in
//     Float64Array. Equivalent to the historical encoding.
// The z-slot (simplification weight) and POLYGON ringSize are stored
// sqrt-linear so they stay in Int32 range and so tile.js's keep-or-drop
// comparison is `> tolerance` (linear) for both paths.

export default function convert(data, options) {
    const features = [];
    if (data.type === 'FeatureCollection') {
        for (let i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], options, i);
        }
    } else if (data.type === 'Feature') {
        convertFeature(features, data, options);
    } else {
        // single geometry or a geometry collection
        convertFeature(features, {geometry: data}, options);
    }
    return features;
}

function convertFeature(features, geojson, options, index) {
    if (!geojson.geometry) return;

    const coords = geojson.geometry.coordinates;
    if (coords && coords.length === 0) return;

    const type = geojson.geometry.type;
    // tolerance is given in pixels-at-tile-extent; convert to storage-space
    // distance at maxZoom and square it for simplify's internal comparison.
    const tolerance = options.tolerance * options.worldScale / ((1 << options.maxZoom) * options.extent);
    const sqTolerance = tolerance * tolerance;
    const tags = geojson.properties;
    const CoordArray = options.CoordArray;
    const S = options.worldScale;
    const O = options.originShift;

    let id = geojson.id;
    if (options.promoteId) id = geojson.properties[options.promoteId];
    else if (options.generateId) id = index || 0;

    if (type === 'Point') {
        features.push(createSinglePoint(id, projectX(coords[0], S, O), projectY(coords[1], S, O), tags));

    } else if (type === 'MultiPoint') {
        const geom = new CoordArray(coords.length * 3);
        for (let i = 0; i < coords.length; i++) writePoint(geom, i * 3, coords[i], S, O);
        pushFeature(features, id, POINT, geom, tags, options);

    } else if (type === 'LineString') {
        const geom = new CoordArray(2 + coords.length * 3);
        writeLine(geom, 0, coords, sqTolerance, false, false, S, O);
        pushFeature(features, id, LINE, geom, tags, options);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into separate features so each carries its own metrics
            for (const lineCoords of coords) {
                const geom = new CoordArray(2 + lineCoords.length * 3);
                writeLine(geom, 0, lineCoords, sqTolerance, false, false, S, O);
                pushFeature(features, id, LINE, geom, tags, options);
            }
        } else {
            const geom = new CoordArray(ringsBufferSize(coords));
            let idx = 0;
            for (const lineCoords of coords) idx = writeLine(geom, idx, lineCoords, sqTolerance, false, false, S, O);
            pushFeature(features, id, LINE, geom, tags, options);
        }

    } else if (type === 'Polygon') {
        const geom = new CoordArray(ringsBufferSize(coords));
        let idx = 0;
        // for polygons, ring index 0 is outer per GeoJSON spec; others are holes
        for (let i = 0; i < coords.length; i++) {
            idx = writeLine(geom, idx, coords[i], sqTolerance, true, i === 0, S, O);
        }
        pushFeature(features, id, POLYGON, geom, tags, options);

    } else if (type === 'MultiPolygon') {
        // flatten all polygons' rings into one list; winding distinguishes
        // outer rings (positive area) from holes (negative area).
        let total = 0;
        for (const polyCoords of coords) total += ringsBufferSize(polyCoords);
        const geom = new CoordArray(total);
        let idx = 0;
        for (const polyCoords of coords) {
            for (let i = 0; i < polyCoords.length; i++) {
                idx = writeLine(geom, idx, polyCoords[i], sqTolerance, true, i === 0, S, O);
            }
        }
        pushFeature(features, id, POLYGON, geom, tags, options);

    } else if (type === 'GeometryCollection') {
        for (const g of geojson.geometry.geometries) {
            convertFeature(features, {id, geometry: g, properties: geojson.properties}, options, index);
        }
    } else {
        throw new Error('Input data is not a valid GeoJSON object.');
    }
}

function ringsBufferSize(rings) {
    let n = 0;
    for (const ring of rings) if (ring.length > 0) n += 2 + ring.length * 3;
    return n;
}

function pushFeature(features, id, type, geom, tags, options) {
    const feature = createFeature(id, type, geom, tags);
    if (type === LINE && options.lineMetrics) {
        feature.start = 0;
        feature.end = geom[1]; // first ring's ringSize (line length)
    }
    features.push(feature);
}

function writePoint(out, idx, coords, S, O) {
    out[idx]     = projectX(coords[0], S, O);
    out[idx + 1] = projectY(coords[1], S, O);
    out[idx + 2] = 0;
}

// Write one ring (header + coords) at `idx` into the pre-sized geometry
// buffer. Returns the next write position. `ringSize` is stored sqrt-linear
// for POLYGON (sign(area) * sqrt(|area|)) and linear length for LINE — both
// stay in Int32 range at the worst-case world span.
function writeLine(out, idx, ring, sqTolerance, isPolygon, isOuter, S, O) {
    // empty rings are skipped at the call sites; this guard prevents
    // KEEP_Z scribbling past the reserved header into the next ring
    if (ring.length === 0) return idx;
    const headerIdx = idx;
    idx += 2; // reserve [ringLen, ringSize]; backfilled below
    const coords0 = idx;

    let x0, y0;
    let size = 0;

    for (let j = 0; j < ring.length; j++) {
        const x = projectX(ring[j][0], S, O);
        const y = projectY(ring[j][1], S, O);

        out[idx]     = x;
        out[idx + 1] = y;
        out[idx + 2] = 0;
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

    // canonical winding: outer rings get one orientation, holes the opposite,
    // determined structurally from GeoJSON nesting (not from input winding)
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
    // KEEP_Z: sentinel exceeding any tolerance at any zoom; Int32 max.
    out[coords0 + 2] = 0x7FFFFFFF;
    simplify(out, coords0, lastIdx, sqTolerance);
    out[lastIdx + 2] = 0x7FFFFFFF;

    // backfill header. POLYGON: sign(area)*sqrt(|area|) — keeps sign for
    // outer/hole distinction, fits Int32 since |area| ≤ W², sqrt ≤ W ≤ 2^32.
    // LINE: linear length (already in storage units).
    out[headerIdx] = (coordsEnd - coords0) / 3;
    out[headerIdx + 1] = isPolygon ? Math.sign(size) * Math.sqrt(Math.abs(size)) : size;

    return idx;
}

function projectX(x, S, O) {
    return (x / 360 + 0.5 - O) * S;
}

function projectY(y, S, O) {
    const sin = Math.sin(y * Math.PI / 180);
    const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    const yc = y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
    return (yc - O) * S;
}

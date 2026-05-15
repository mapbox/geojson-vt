
import simplify from './simplify.js';
import createFeature, {POINT, LINE, POLYGON} from './feature.js';

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

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
    const tolerance = Math.pow(options.tolerance / ((1 << options.maxZoom) * options.extent), 2);
    const tags = geojson.properties;

    let id = geojson.id;
    if (options.promoteId) id = geojson.properties[options.promoteId];
    else if (options.generateId) id = index || 0;

    if (type === 'Point') {
        const geom = [];
        convertPoint(coords, geom);
        pushFeature(features, id, POINT, geom, tags, options);

    } else if (type === 'MultiPoint') {
        const geom = [];
        for (const p of coords) convertPoint(p, geom);
        pushFeature(features, id, POINT, geom, tags, options);

    } else if (type === 'LineString') {
        const geom = [];
        appendLine(geom, coords, tolerance, false, false);
        pushFeature(features, id, LINE, geom, tags, options);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into separate features so each carries its own metrics
            for (const lineCoords of coords) {
                const geom = [];
                appendLine(geom, lineCoords, tolerance, false, false);
                pushFeature(features, id, LINE, geom, tags, options);
            }
        } else {
            const geom = [];
            for (const lineCoords of coords) appendLine(geom, lineCoords, tolerance, false, false);
            pushFeature(features, id, LINE, geom, tags, options);
        }

    } else if (type === 'Polygon') {
        const geom = [];
        // for polygons, ring index 0 is outer per GeoJSON spec; others are holes
        for (let i = 0; i < coords.length; i++) {
            appendLine(geom, coords[i], tolerance, true, i === 0);
        }
        pushFeature(features, id, POLYGON, geom, tags, options);

    } else if (type === 'MultiPolygon') {
        // flatten all polygons' rings into one list; winding distinguishes
        // outer rings (positive area) from holes (negative area).
        const geom = [];
        for (const polyCoords of coords) {
            for (let i = 0; i < polyCoords.length; i++) {
                appendLine(geom, polyCoords[i], tolerance, true, i === 0);
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

function pushFeature(features, id, type, geom, tags, options) {
    const feature = createFeature(id, type, geom, tags);
    if (type === LINE && options.lineMetrics) {
        feature.start = 0;
        feature.end = geom[1]; // first ring's ringSize (line length)
    }
    features.push(feature);
}

function convertPoint(coords, out) {
    out.push(projectX(coords[0]), projectY(coords[1]), 0);
}

// Append one ring (header + coords) to the inline-header geometry buffer.
function appendLine(out, ring, tolerance, isPolygon, isOuter) {
    const headerIdx = out.length;
    out.push(0, 0); // reserve [ringLen, ringSize]; backfilled below
    const coords0 = out.length;

    let x0, y0;
    let size = 0;

    for (let j = 0; j < ring.length; j++) {
        const x = projectX(ring[j][0]);
        const y = projectY(ring[j][1]);

        out.push(x, y, 0);

        if (j > 0) {
            if (isPolygon) {
                size += (x0 * y - x * y0) / 2; // signed area
            } else {
                size += Math.sqrt(Math.pow(x - x0, 2) + Math.pow(y - y0, 2)); // length
            }
        }
        x0 = x;
        y0 = y;
    }

    const coordsEnd = out.length;

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
    out[coords0 + 2] = 1;
    simplify(out, coords0, lastIdx, tolerance);
    out[lastIdx + 2] = 1;

    // backfill header
    out[headerIdx] = (coordsEnd - coords0) / 3;
    out[headerIdx + 1] = isPolygon ? size : Math.abs(size);
}

function projectX(x) {
    return x / 360 + 0.5;
}

function projectY(y) {
    const sin = Math.sin(y * Math.PI / 180);
    const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}

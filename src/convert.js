
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
        const ring = [];
        convertPoint(coords, ring);
        pushFeature(features, id, POINT, ring, tags, options);

    } else if (type === 'MultiPoint') {
        const ring = [];
        for (const p of coords) convertPoint(p, ring);
        pushFeature(features, id, POINT, ring, tags, options);

    } else if (type === 'LineString') {
        const line = convertLine(coords, tolerance, false, false);
        pushFeature(features, id, LINE, [line], tags, options);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into separate features so each carries its own metrics
            for (const lineCoords of coords) {
                const line = convertLine(lineCoords, tolerance, false, false);
                pushFeature(features, id, LINE, [line], tags, options);
            }
        } else {
            const rings = [];
            for (const lineCoords of coords) rings.push(convertLine(lineCoords, tolerance, false, false));
            pushFeature(features, id, LINE, rings, tags, options);
        }

    } else if (type === 'Polygon') {
        pushFeature(features, id, POLYGON, convertRings(coords, tolerance), tags, options);

    } else if (type === 'MultiPolygon') {
        // flatten all polygons' rings into one list; winding distinguishes
        // outer rings (positive area) from holes (negative area).
        const rings = [];
        for (const polyCoords of coords) {
            for (let i = 0; i < polyCoords.length; i++) {
                rings.push(convertLine(polyCoords[i], tolerance, true, i === 0));
            }
        }
        pushFeature(features, id, POLYGON, rings, tags, options);

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
        feature.end = geom[0].size;
    }
    features.push(feature);
}

function convertRings(rings, tolerance) {
    const out = [];
    for (let i = 0; i < rings.length; i++) {
        // for polygons, ring index 0 is outer per GeoJSON spec; others are holes
        out.push(convertLine(rings[i], tolerance, true, i === 0));
    }
    return out;
}

function convertPoint(coords, out) {
    out.push(projectX(coords[0]), projectY(coords[1]), 0);
}

function convertLine(ring, tolerance, isPolygon, isOuter) {
    const out = /** @type {number[] & {size: number}} */ ([]);
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

    // canonical winding: outer rings get one orientation, holes the opposite,
    // determined structurally from GeoJSON nesting (not from input winding)
    if (isPolygon && ((isOuter && size < 0) || (!isOuter && size >= 0))) {
        for (let i = 0, len = out.length; i < len / 2; i += 3) {
            const x = out[i];
            const y = out[i + 1];
            const z = out[i + 2];
            out[i]     = out[len - 3 - i];
            out[i + 1] = out[len - 2 - i];
            out[i + 2] = out[len - 1 - i];
            out[len - 3 - i] = x;
            out[len - 2 - i] = y;
            out[len - 1 - i] = z;
        }
    }

    const last = out.length - 3;
    out[2] = 1;
    simplify(out, 0, last, tolerance);
    out[last + 2] = 1;

    out.size = Math.abs(size);
    return out;
}

function projectX(x) {
    return x / 360 + 0.5;
}

function projectY(y) {
    const sin = Math.sin(y * Math.PI / 180);
    const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}

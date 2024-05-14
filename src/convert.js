
import simplify from './simplify.js';
import createFeature from './feature.js';

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

export default function convert(data, options) {
    const features = [];
    if (data.type === 'FeatureCollection') {
        for (let i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], options, i);
        }

    } else if (data.type === 'Feature') {
        convertFeature(features, data, options, 0);

    } else {
        // single geometry or a geometry collection
        convertFeature(features, {geometry: data}, options, 0);
    }

    return features;
}

function convertFeature(features, geojson, options, index) {
    if (!geojson.geometry) return;

    const coords = geojson.geometry.coordinates;
    const type = geojson.geometry.type;
    const tolerance = Math.pow(options.tolerance / ((1 << options.maxZoom) * options.extent), 2);
    let geometry = [];
    let id = geojson.id;
    if (options.promoteId) {
        id = geojson.properties[options.promoteId];
    } else if (options.generateId) {
        id = index || 0;
    }
    if (type === 'Point') {
        convertPoint(coords, geometry, options.dimensions);

    } else if (type === 'MultiPoint') {
        for (const p of coords) {
            convertPoint(p, geometry, options.dimensions);
        }

    } else if (type === 'LineString') {
        convertLine(coords, geometry, tolerance, false, options.dimensions);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into linestrings to be able to track metrics
            for (const line of coords) {
                geometry = [];
                convertLine(line, geometry, tolerance, false, options.dimensions);
                features.push(createFeature(id, 'LineString', geometry, geojson.properties, index, options.dimensions + 2));
            }
            return;
        } else {
            convertLines(coords, geometry, tolerance, false, options.dimensions);
        }

    } else if (type === 'Polygon') {
        convertLines(coords, geometry, tolerance, true, options.dimensions);

    } else if (type === 'MultiPolygon') {
        for (const polygon of coords) {
            const newPolygon = [];
            convertLines(polygon, newPolygon, tolerance, true, options.dimensions);
            geometry.push(newPolygon);
        }
    } else if (type === 'GeometryCollection') {
        for (const singleGeometry of geojson.geometry.geometries) {
            convertFeature(features, {
                id,
                geometry: singleGeometry,
                properties: geojson.properties
            }, options, index);
        }
        return;
    } else {
        throw new Error('Input data is not a valid GeoJSON object.');
    }

    features.push(createFeature(id, type, geometry, geojson.properties, index, options.dimensions + 2));
}

function convertPoint(coords, out, dimensions = 2) {
    out.push(projectX(coords[0]), projectY(coords[1]), 0, 1);
    for (let i = 2; i < dimensions; i++) {
        out.push(coords[i]);
    }
}

function convertLine(ring, out, tolerance, isPolygon, dimensions = 2) {
    let x0, y0;
    let size = 0;

    for (let j = 0; j < ring.length; j++) {
        const x = projectX(ring[j][0]);
        const y = projectY(ring[j][1]);

        out.push(x, y, 0, 1);
        for (let i = 2; i < dimensions; i++) {
            out.push(ring[j][i]);
        }
        if (j > 0) {
            if (isPolygon) {
                size += (x0 * y - x * y0) / 2; // area
            } else {
                size += Math.sqrt(Math.pow(x - x0, 2) + Math.pow(y - y0, 2)); // length
            }
        }
        x0 = x;
        y0 = y;
    }

    const last = out.length - (dimensions + 2);
    out[2] = 1;
    simplify(out, 0, last, tolerance, dimensions);
    out[last + 2] = 1;

    out.size = Math.abs(size);
    out.start = 0;
    out.end = out.size;
}

function convertLines(rings, out, tolerance, isPolygon, dimensions = 2) {
    for (let i = 0; i < rings.length; i++) {
        const geom = [];
        convertLine(rings[i], geom, tolerance, isPolygon, dimensions);
        out.push(geom);
    }
}

function projectX(x) {
    return x / 360 + 0.5;
}

function projectY(y) {
    const sin = Math.sin(y * Math.PI / 180);
    const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}

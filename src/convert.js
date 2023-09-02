
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
    const type = geojson.geometry.type;
    const tolerance = Math.pow(options.tolerance / ((1 << options.maxZoom) * options.extent), 2);
    let geometry = [];
    let sqDist = []; // squared distances for simplification
    let id = geojson.id;
    if (options.promoteId) {
        id = geojson.properties[options.promoteId];
    } else if (options.generateId) {
        id = index || 0;
    }
    if (type === 'Point') {
        convertPoint(coords, geometry);

    } else if (type === 'MultiPoint') {
        for (const p of coords) {
            convertPoint(p, geometry);
        }

    } else if (type === 'LineString') {
        convertLine(coords, geometry, sqDist, tolerance, false);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into linestrings to be able to track metrics
            for (const line of coords) {
                geometry = [];
                sqDist = [];
                convertLine(line, geometry, sqDist, tolerance, false);
                features.push(createFeature(id, 'LineString', geometry, geojson.properties));
            }
            return;
        } else {
            convertLines(coords, geometry, sqDist, tolerance, false);
        }

    } else if (type === 'Polygon') {
        convertLines(coords, geometry, sqDist, tolerance, true);

    } else if (type === 'MultiPolygon') {
        for (const polygon of coords) {
            const newPolygon = [];
            const newSqDist = [];
            convertLines(polygon, newPolygon, newSqDist, tolerance, true);
            geometry.push(newPolygon);
            sqDist.push(newSqDist);
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

    features.push(createFeature(id, type, geometry, sqDist, geojson.properties));
}

function convertPoint(coords, out) {
    out.push(projectX(coords[0]), projectY(coords[1]));

    if (coords.length > 2) {
        out.push(coords[2]);
    } else {
        out.push(0);
    }
}

function convertLine(ring, out, sqDist, tolerance, isPolygon) {
    let x0, y0;
    let size = 0;

    for (let j = 0; j < ring.length; j++) {
        const x = projectX(ring[j][0]);
        const y = projectY(ring[j][1]);

        out.push(x, y);
        if (ring[j].length > 2) {
            out.push(ring[j][2]);
        } else {
            out.push(0);
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

    const last = out.length - 3;
    sqDist.length = out.length / 3;
    sqDist.fill(0);
    sqDist[0] = 1;
    simplify(sqDist, out, 0, last, tolerance);
    sqDist[last / 3] = 1;

    out.size = Math.abs(size);
    out.start = 0;
    out.end = out.size;
}

function convertLines(rings, out, outSqDist, tolerance, isPolygon) {
    for (let i = 0; i < rings.length; i++) {
        const geom = [];
        const sqDist = [];
        convertLine(rings[i], geom, sqDist, tolerance, isPolygon);
        out.push(geom);
        outSqDist.push(sqDist);
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


import simplify from './simplify';
import createFeature from './feature';

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

export default function convert(data, options) {
    var features = [];

    if (data.type === 'FeatureCollection') {
        for (var i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], options);
        }

    } else if (data.type === 'Feature') {
        convertFeature(features, data, options);

    } else {
        // single geometry or a geometry collection
        convertFeature(features, {geometry: data}, options);
    }

    return features;
}

function convertFeature(features, geojson, options) {
    if (!geojson.geometry) return;

    var coords = geojson.geometry.coordinates;
    var type = geojson.geometry.type;
    var tolerance = Math.pow(options.tolerance / ((1 << options.maxZoom) * options.extent), 2);
    var dimensions = options.dimensions;
    var geometry = [];

    if (type === 'Point') {
        convertPoint(dimensions, coords, geometry);

    } else if (type === 'MultiPoint') {
        for (var i = 0; i < coords.length; i++) {
            convertPoint(dimensions, coords[i], geometry);
        }

    } else if (type === 'LineString') {
        convertLine(dimensions, coords, geometry, tolerance, false);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into linestrings to be able to track metrics
            for (i = 0; i < coords.length; i++) {
                geometry = [];
                convertLine(dimensions, coords[i], geometry, tolerance, false);
                features.push(createFeature(dimensions, geojson.id, 'LineString', geometry, geojson.properties));
                return;
            }
        } else {
            convertLines(dimensions, coords, geometry, tolerance, false);
        }

    } else if (type === 'Polygon') {
        convertLines(dimensions, coords, geometry, tolerance, true);

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < coords.length; i++) {
            var polygon = [];
            convertLines(dimensions, coords[i], polygon, tolerance, true);
            geometry.push(polygon);
        }
    } else if (type === 'GeometryCollection') {
        for (i = 0; i < geojson.geometry.geometries.length; i++) {
            convertFeature(features, {
                id: geojson.id,
                geometry: geojson.geometry.geometries[i],
                properties: geojson.properties
            }, options);
        }
        return;
    } else {
        throw new Error('Input data is not a valid GeoJSON object.');
    }

    features.push(createFeature(dimensions, geojson.id, type, geometry, geojson.properties));
}

function convertPoint(dimensions, coords, out) {
    out.push(projectX(coords[0]));
    out.push(projectY(coords[1]));
    if (dimensions === 3) out.push(coords[2] || 0);
    out.push(0);
}

function convertLine(dimensions, ring, out, tolerance, isPolygon) {
    var x0, y0;
    var size = 0;
    var stride = dimensions + 1;
    for (var j = 0; j < ring.length; j++) {
        var x = projectX(ring[j][0]);
        var y = projectY(ring[j][1]);
        if (dimensions === 3) var z = ring[j][2];

        out.push(x);
        out.push(y);
        if (dimensions === 3) out.push(z);
        out.push(0);

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

    var last = out.length - stride;
    out[stride - 1] = 1;
    simplify(dimensions, out, 0, last, tolerance);
    out[last + stride - 1] = 1;
    out.size = Math.abs(size);
    out.start = 0;
    out.end = out.size;
}

function convertLines(dimensions, rings, out, tolerance, isPolygon) {
    for (var i = 0; i < rings.length; i++) {
        var geom = [];
        convertLine(dimensions, rings[i], geom, tolerance, isPolygon);
        out.push(geom);
    }
}

function projectX(x) {
    return x / 360 + 0.5;
}

function projectY(y) {
    var sin = Math.sin(y * Math.PI / 180);
    var y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}

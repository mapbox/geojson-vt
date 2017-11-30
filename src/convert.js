'use strict';

module.exports = convert;

var simplify = require('./simplify');

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

function convert(data, tolerance) {
    var features = [];

    if (data.type === 'FeatureCollection') {
        for (var i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], tolerance);
        }

    } else if (data.type === 'Feature') {
        convertFeature(features, data, tolerance);

    } else {
        // single geometry or a geometry collection
        convertFeature(features, {geometry: data}, tolerance);
    }

    return features;
}

function convertFeature(features, geojson, tolerance) {
    var coords = geojson.geometry.coordinates;
    var type = geojson.geometry.type;

    var geometry = [];

    var feature = {
        id: geojson.id || null,
        type: 0,
        geometry: geometry,
        tags: geojson.properties,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };

    var tol = tolerance * tolerance;

    if (type === 'Point') {
        convertPoint(feature, coords, geometry);
        feature.type = 1;

    } else if (type === 'MultiPoint') {
        for (var i = 0; i < coords.length; i++) {
            convertPoint(feature, coords[i], geometry);
        }
        feature.type = 1;

    } else if (type === 'LineString') {
        convertLine(feature, coords, geometry, tol, false);
        feature.type = 2;

    } else if (type === 'MultiLineString') {
        convertLines(feature, coords, geometry, tol, false);
        feature.type = 2;

    } else if (type === 'Polygon') {
        convertLines(feature, coords, geometry, tol, true);
        feature.type = 3;

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < coords.length; i++) {
            var polygon = [];
            convertLines(feature, coords[i], polygon, tol, true);
            geometry.push(polygon);
        }
        feature.type = 3;
    }

    features.push(feature);
}

function convertPoint(feature, coords, out) {
    var x = projectX(coords[0]);
    var y = projectY(coords[1]);

    if (x < feature.minX) feature.minX = x;
    if (y < feature.minY) feature.minY = y;
    if (x > feature.maxX) feature.maxX = x;
    if (y > feature.maxY) feature.maxY = y;

    out.push(x);
    out.push(y);
    out.push(0);
}

function convertLine(feature, ring, out, tol, isPolygon) {
    var x0, y0;
    var size = 0;

    for (var j = 0; j < ring.length; j++) {
        var x = projectX(ring[j][0]);
        var y = projectY(ring[j][1]);

        if (x < feature.minX) feature.minX = x;
        if (y < feature.minY) feature.minY = y;
        if (x > feature.maxX) feature.maxX = x;
        if (y > feature.maxY) feature.maxY = y;

        out.push(x);
        out.push(y);
        out.push(0);

        if (j > 0) {
            if (isPolygon) {
                size += x0 * y - x * y0; // area
            } else {
                size += Math.sqrt(Math.pow(x - x0, 2) + Math.pow(y - y0, 2)); // length
            }
        }
        x0 = x;
        y0 = y;
    }

    var last = out.length - 3;
    out[0] = 1;
    simplify(out, 0, last, tol);
    out[last] = 1;

    out.size = Math.abs(size);
}

function convertLines(feature, rings, out, tol, isPolygon) {
    for (var i = 0; i < rings.length; i++) {
        var geom = [];
        convertLine(feature, rings[i], geom, tol, isPolygon);
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

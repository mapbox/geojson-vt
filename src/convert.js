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

function convertFeature(features, feature, tolerance) {
    var coords = feature.geometry.coordinates;
    var type = feature.geometry.type;

    var geometry = [];

    var converted = {
        id: feature.id,
        type: type,
        geometry: geometry,
        tags: feature.properties,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };

    var tol = tolerance * tolerance;

    if (type === 'Point') {
        convertPoint(converted, coords, geometry);

    } else if (type === 'MultiPoint') {
        for (var i = 0; i < coords.length; i++) {
            convertPoint(converted, coords[i], geometry);
        }

    } else if (type === 'LineString') {
        convertRing(converted, coords, geometry, tol, false);

    } else if (type === 'Polygon' || type === 'MultiLineString') {
        convertRings(converted, coords, geometry, tol, type === 'Polygon');

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < coords.length; i++) {
            var polygon = [];
            geometry.push(polygon);
            convertRings(converted, coords[i], polygon, tol, true);
        }
    }

    features.push(converted);
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

function convertRing(feature, ring, out, tol, isPolygon) {
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

function convertRings(feature, rings, out, tol, isPolygon) {
    for (var i = 0; i < rings.length; i++) {
        var geom = [];
        out.push(geom);
        convertRing(feature, rings[i], geom, tol, isPolygon);
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

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
        convertPoint(converted, coords);

    } else if (type === 'MultiPoint') {
        for (var i = 0; i < coords.length; i++) {
            convertPoint(converted, coords[i]);
        }

    } else if (type === 'LineString') {
        convertRing(feature, coords, tol);

    } else if (type === 'Polygon' || type === 'MultiLineString') {
        convertRings(converted, coords, tol);

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < coords.length; i++) {
            geometry.push(coords[i].length);
            convertRings(converted, coords[i], tol);
        }
    }

    features.push(converted);
}

function convertPoint(feature, coords) {
    var geom = feature.geometry;
    var x = projectX(coords[0]);
    var y = projectY(coords[1]);

    if (x < feature.minX) feature.minX = x;
    if (y < feature.minY) feature.minY = y;
    if (x > feature.maxX) feature.maxX = x;
    if (y > feature.maxY) feature.maxY = y;

    geom.push(x);
    geom.push(y);
    geom.push(0);
}

function convertRing(feature, ring, tol) {
    var x0, y0;
    var area = 0;
    var dist = 0;

    var geom = feature.geometry;
    var first = geom.length;

    for (var j = 0; j < ring.length; j++) {
        var x = projectX(ring[j][0]);
        var y = projectY(ring[j][1]);

        if (x < feature.minX) feature.minX = x;
        if (y < feature.minY) feature.minY = y;
        if (x > feature.maxX) feature.maxX = x;
        if (y > feature.maxY) feature.maxY = y;

        geom.push(x);
        geom.push(y);
        geom.push(0);

        if (j > 1) {
            area += x0 * y - x * y0;
            dist += Math.abs(x - x0) + Math.abs(y - y0);
        }
        x0 = x;
        y0 = y;
    }

    var last = geom.length - 3;
    geom[first] = 1;
    simplify(geom, first, last, tol);
    geom[last] = 1;

    geom.push(area);
    geom.push(dist);
}

function convertRings(feature, rings, tol) {
    for (var i = 0; i < rings.length; i++) {
        feature.geometry.push(rings[i].length);
        convertRing(feature, rings[i], tol);
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

'use strict';

module.exports = convert;

var simplify = require('./simplify');

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

function convert(data, tolerance) {
    var features = [];
    // TODO other types
    for (var i = 0; i < data.features.length; i++) {
        convertFeature(features, data.features[i], tolerance);
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

    // TODO other types
    if (type === 'Polygon') {
        convertPolygon(converted, coords, tol);

    } else if (type === 'MultiPolygon') {
        for (var i = 0; i < coords.length; i++) {
            var polygon = coords[i];
            geometry.push(polygon.length);
            convertPolygon(converted, polygon, tol);
        }
    }

    features.push(converted);
}

function convertPolygon(feature, rings, tol) {
    for (var i = 0; i < rings.length; i++) {
        var ring = rings[i];
        feature.geometry.push(ring.length);
        convertRing(feature, ring, tol);
    }
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

function projectX(x) {
    return x / 360 + 0.5;
}

function projectY(y) {
    var sin = Math.sin(y * Math.PI / 180);
    var y = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y < 0 ? 0 : y > 1 ? 1 : y;
}

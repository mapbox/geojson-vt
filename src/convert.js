'use strict';

module.exports = convert;

var simplify = require('./simplify');

// converts GeoJSON feature into an intermediate JSON vector format with projection & simplification

function convert(feature, tolerance) {
    var geom = feature.geometry,
        coords = geom.coordinates,
        tags = feature.properties;

    if (geom.type === 'LineString') {
        return create(tags, 2, project(coords, tolerance));

    } else if (geom.type === 'Polygon' && coords.length === 1) {
        return create(tags, 3, project(coords[0], tolerance));

    } else {
        console.log('Unsupported GeoJSON type: ' + geom.type);
    }
}

function create(tags, type, geometry) {
    return {
        geometry: geometry,
        type: type,
        tags: tags || null
    };
}

function project(lonlats, tolerance) {
    var projected = [];
    for (var i = 0; i < lonlats.length; i++) {
        projected.push(projectPoint(lonlats[i]));
    }
    simplify(projected, tolerance);
    return projected;
}

function projectPoint(p) {
    var sin = Math.sin(p[1] * Math.PI / 180),
        x = (p[0] / 360 + 0.5),
        y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return [x, y, 0];
}

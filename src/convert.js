'use strict';

module.exports = convert;

var simplify = require('./simplify');

// converts GeoJSON feature into an intermediate JSON vector format with projection & simplification

function convert(feature, tolerance) {
    var geom = feature.geometry,
        type = geom.type,
        coords = geom.coordinates,
        tags = feature.properties,
        i, j, rings;

    if (type === 'Point') return create(tags, 1, [projectPoint(coords)]);
    else if (type === 'MultiPoint') return create(tags, 1, project(coords));
    else if (type === 'LineString') return create(tags, 2, [project(coords, tolerance)]);

    else if (type === 'MultiLineString' || type === 'Polygon') {
        rings = [];
        for (i = 0; i < coords.length; i++) {
            rings.push(project(coords[i], tolerance));
        }
        return create(tags, type === 'Polygon' ? 3 : 2, rings);

    } else if (type === 'MultiPolygon') {
        rings = [];
        for (i = 0; i < coords.length; i++) {
            for (j = 0; j < coords[i].length; j++) {
                rings.push(project(coords[i][j], tolerance));
            }
        }
        return create(tags, 3, rings);

    } else {
        console.warn('Unsupported GeoJSON type: ' + geom.type);
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
    if (tolerance) {
        simplify(projected, tolerance);
        calcSize(projected);
    }

    return projected;
}

// calculate length and size of the poly
function calcSize(points) {
    var sum = 0,
        dist = 0;
    for (var i = 0, a, b; i < points.length - 1; i++) {
        a = b || points[i];
        b = points[i + 1];
        sum += a[0] * b[1] - b[0] * a[1];
        dist += Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]); // Manhattan distance
    }
    points.area = Math.abs(sum / 2);
    points.dist = dist;
}

function projectPoint(p) {
    var sin = Math.sin(p[1] * Math.PI / 180),
        x = (p[0] / 360 + 0.5),
        y = (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return [x, y, 0];
}

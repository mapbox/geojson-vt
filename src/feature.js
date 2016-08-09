'use strict';

module.exports = createFeature;

function createFeature(tags, type, geom, id) {
    var feature = {
        id: id || null,
        type: type,
        geometry: geom,
        tags: tags || null,
        min: [Infinity, Infinity], // initial bbox values
        max: [-Infinity, -Infinity]
    };
    calcBBox(feature);
    return feature;
}

// calculate the feature bounding box for faster clipping later
function calcBBox(feature) {
    var geometry = feature.geometry,
        min = feature.min,
        max = feature.max;

    if (feature.type === 1) {
        calcRingBBox(min, max, geometry);
    } else {
        for (var i = 0; i < geometry.length; i++) {
            calcRingBBox(min, max, geometry[i]);
        }
    }

    return feature;
}

function calcRingBBox(min, max, points) {
    for (var i = 0, p; i < points.length; i++) {
        p = points[i];
        min[0] = Math.min(p[0], min[0]);
        max[0] = Math.max(p[0], max[0]);
        min[1] = Math.min(p[1], min[1]);
        max[1] = Math.max(p[1], max[1]);
    }
}

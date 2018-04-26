
export default function createFeature(dimensions, id, type, geom, tags) {
    var feature = {
        id: id || null,
        type: type,
        geometry: geom,
        tags: tags,
        minX: Infinity,
        minY: Infinity,
        minZ: dimensions === 3 ?  Infinity : undefined,
        maxX: -Infinity,
        maxY: -Infinity,
        maxZ: dimensions === 3 ?  -Infinity : undefined
    };
    calcBBox(dimensions, feature);
    return feature;
}

function calcBBox(dimensions, feature) {
    var geom = feature.geometry;
    var type = feature.type;

    if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
        calcLineBBox(dimensions, feature, geom);

    } else if (type === 'Polygon' || type === 'MultiLineString') {
        for (var i = 0; i < geom.length; i++) {
            calcLineBBox(dimensions, feature, geom[i]);
        }

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < geom.length; i++) {
            for (var j = 0; j < geom[i].length; j++) {
                calcLineBBox(dimensions, feature, geom[i][j]);
            }
        }
    }
}

function calcLineBBox(dimensions, feature, geom) {
    var stride = dimensions + 1;
    for (var i = 0; i < geom.length; i += stride) {
        feature.minX = Math.min(feature.minX, geom[i]);
        feature.minY = Math.min(feature.minY, geom[i + 1]);
        if (dimensions === 3) feature.minZ = Math.min(feature.minZ, geom[i + 2]);
        feature.maxX = Math.max(feature.maxX, geom[i]);
        feature.maxY = Math.max(feature.maxY, geom[i + 1]);
        if (dimensions === 3) feature.maxZ = Math.max(feature.maxZ, geom[i + 2]);
    }
}


export default function createFeature(id, type, geom, tags) {
    const feature = {
        id: typeof id === 'undefined' ? null : id,
        type,
        geometry: geom,
        tags,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
    calcBBox(feature);
    return feature;
}

function calcBBox(feature) {
    const geom = feature.geometry;
    const type = feature.type;

    if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
        calcLineBBox(feature, geom);

    } else if (type === 'Polygon' || type === 'MultiLineString') {
        for (const line of geom) {
            calcLineBBox(feature, line);
        }

    } else if (type === 'MultiPolygon') {
        for (const polygon of geom) {
            for (const line of polygon) {
                calcLineBBox(feature, line);
            }
        }
    }
}

function calcLineBBox(feature, geom) {
    for (let i = 0; i < geom.length; i += 3) {
        feature.minX = Math.min(feature.minX, geom[i]);
        feature.minY = Math.min(feature.minY, geom[i + 1]);
        feature.maxX = Math.max(feature.maxX, geom[i]);
        feature.maxY = Math.max(feature.maxY, geom[i + 1]);
    }
}


export default function createFeature(id, type, geom, tags, index, stride = 4) {
    const feature = {
        id: id == null ? null : id,
        index,
        type,
        geometry: geom,
        tags,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };

    if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
        calcLineBBox(feature, geom, stride);

    } else if (type === 'Polygon') {
        // the outer ring (ie [0]) contains all inner rings
        calcLineBBox(feature, geom[0], stride);

    } else if (type === 'MultiLineString') {
        for (const line of geom) {
            calcLineBBox(feature, line, stride);
        }

    } else if (type === 'MultiPolygon') {
        for (const polygon of geom) {
            // the outer ring (ie [0]) contains all inner rings
            calcLineBBox(feature, polygon[0], stride);
        }
    }

    return feature;
}

function calcLineBBox(feature, geom, stride = 4) {
    for (let i = 0; i < geom.length; i += stride) {
        feature.minX = Math.min(feature.minX, geom[i]);
        feature.minY = Math.min(feature.minY, geom[i + 1]);
        feature.maxX = Math.max(feature.maxX, geom[i]);
        feature.maxY = Math.max(feature.maxY, geom[i + 1]);
    }
}

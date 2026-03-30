
export default function createFeature(id, type, geom, tags) {
    const feature = {
        id: id == null ? null : id,
        type,
        geometry: geom,
        tags,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };

    if (type === 'Point' || type === 'MultiPoint') {
        calcLineBBox(feature, geom);

    } else if (type === 'LineString') {
        calcLineBBox(feature, geom.points);

    } else if (type === 'Polygon') {
        // the outer ring (ie [0]) contains all inner rings
        calcLineBBox(feature, geom[0].points);

    } else if (type === 'MultiLineString') {
        for (const line of geom) {
            calcLineBBox(feature, line.points);
        }

    } else if (type === 'MultiPolygon') {
        for (const polygon of geom) {
            // the outer ring (ie [0]) contains all inner rings
            calcLineBBox(feature, polygon[0].points);
        }
    }

    return feature;
}

export function optimizeLineMemory(line) {
    if (line.points.length > 64) {
        line.points = new Float64Array(line.points);
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

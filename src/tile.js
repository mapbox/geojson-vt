
export default function createTile(features, z, tx, ty, options) {
    const tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
    const tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: features.length,
        source: null,
        x: tx,
        y: ty,
        z,
        transformed: false,
        minX: 2,
        minY: 1,
        maxX: -1,
        maxY: 0
    };
    for (const feature of features) {
        addFeature(tile, feature, tolerance, options);

        const minX = feature.minX;
        const minY = feature.minY;
        const maxX = feature.maxX;
        const maxY = feature.maxY;

        if (minX < tile.minX) tile.minX = minX;
        if (minY < tile.minY) tile.minY = minY;
        if (maxX > tile.maxX) tile.maxX = maxX;
        if (maxY > tile.maxY) tile.maxY = maxY;
    }
    return tile;
}

function addFeature(tile, feature, tolerance, options) {

    const geom = feature.geometry;
    const sqDist = feature.sqDist;
    const type = feature.type;
    const simplified = [];

    if (type === 'Point' || type === 'MultiPoint') {
        for (let i = 0; i < geom.length; i += 3) {
            simplified.push(geom[i], geom[i + 1], geom[i + 2]);
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        addLine(simplified, geom, sqDist, tile, tolerance, false, false);

    } else if (type === 'MultiLineString' || type === 'Polygon') {
        for (let i = 0; i < geom.length; i++) {
            addLine(simplified, geom[i], sqDist[i], tile, tolerance, type === 'Polygon', i === 0);
        }

    } else if (type === 'MultiPolygon') {

        for (let k = 0; k < geom.length; k++) {
            const polygon = geom[k];
            const sqDistPoly = sqDist[k];
            for (let i = 0; i < polygon.length; i++) {
                addLine(simplified, polygon[i], sqDistPoly[i], tile, tolerance, true, i === 0);
            }
        }
    }

    if (simplified.length) {
        let tags = feature.tags || null;

        if (type === 'LineString' && options.lineMetrics) {
            tags = {};
            for (const key in feature.tags) tags[key] = feature.tags[key];
            tags['mapbox_clip_start'] = geom.start / geom.size;
            tags['mapbox_clip_end'] = geom.end / geom.size;
        }

        const tileFeature = {
            geometry: simplified,
            type: type === 'Polygon' || type === 'MultiPolygon' ? 3 :
            (type === 'LineString' || type === 'MultiLineString' ? 2 : 1),
            tags
        };
        if (feature.id !== null) {
            tileFeature.id = feature.id;
        }
        tile.features.push(tileFeature);
    }
}

function addLine(result, geom, sqDist, tile, tolerance, isPolygon, isOuter) {
    const sqTolerance = tolerance * tolerance;

    if (tolerance > 0 && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += geom.length / 3;
        return;
    }

    const ring = [];

    for (let i = 0; i < geom.length; i += 3) {
        //if (tolerance === 0 || geom.simpl[i / 3] > sqTolerance) {
        if (tolerance === 0 || sqDist[i / 3] > sqTolerance) {
            tile.numSimplified++;
            ring.push(geom[i], geom[i + 1], geom[i + 2]);
        }
        tile.numPoints++;
    }

    if (isPolygon) rewind(ring, isOuter);

    result.push(ring);
}

function rewind(ring, clockwise) {
    let area = 0;
    for (let i = 0, len = ring.length, j = len - 3; i < len; j = i, i += 3) {
        area += (ring[i] - ring[j]) * (ring[i + 1] + ring[j + 1]);
    }
    if (area > 0 === clockwise) {
        for (let i = 0, len = ring.length; i < len / 3; i += 3) {
            const x = ring[i];
            const y = ring[i + 1];
            const z = ring[i + 2];
            ring[i] = ring[len - 3 - i];
            ring[i + 1] = ring[len - 2 - i];
            ring[i + 2] = ring[len - 1 - i];
            ring[len - 3 - i] = x;
            ring[len - 2 - i] = y;
            ring[len - 1 - i] = z;
        }
    }
}

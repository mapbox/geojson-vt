
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
    }
    return tile;
}

function addFeature(tile, feature, tolerance, options) {
    const geom = feature.geometry;
    const type = feature.type;
    const stride = options.dimensions + 1;
    let simplified = [];

    tile.minX = Math.min(tile.minX, feature.minX);
    tile.minY = Math.min(tile.minY, feature.minY);
    tile.maxX = Math.max(tile.maxX, feature.maxX);
    tile.maxY = Math.max(tile.maxY, feature.maxY);

    if (type === 'Point' || type === 'MultiPoint') {
        for (let i = 0; i < geom.length; i += stride) {
            simplified.push(geom[i], geom[i + 1]);
            for (let j = 3; j < stride; j++) {
                simplified.push(geom[i + j]);
            }
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        addLine(simplified, geom, tile, tolerance, false, false, stride);

    } else if (type === 'MultiLineString' || type === 'Polygon') {
        for (let i = 0; i < geom.length; i++) {
            addLine(simplified, geom[i], tile, tolerance, type === 'Polygon', i === 0, stride);
        }

        // convert polygon to multipolygon
        if (type === 'Polygon' && simplified.length) {
            simplified = [simplified];
        }
    } else if (type === 'MultiPolygon') {

        for (let k = 0; k < geom.length; k++) {
            const polygon = geom[k];
            const simplifiedPolygon = [];
            for (let i = 0; i < polygon.length; i++) {
                addLine(simplifiedPolygon, polygon[i], tile, tolerance, true, i === 0, stride);
            }
            if (simplifiedPolygon.length) {
                simplified.push(simplifiedPolygon);
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
        if (options.generateIndex) {
            tileFeature.index = feature.index;
        }
        tile.features.push(tileFeature);
    }
}

function addLine(result, geom, tile, tolerance, isPolygon, isOuter, stride = 3) {
    const sqTolerance = tolerance * tolerance;

    if (tolerance > 0 && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += geom.length / stride;
        return;
    }

    const ring = [];

    for (let i = 0; i < geom.length; i += stride) {
        if (tolerance === 0 || geom[i + 2] > sqTolerance) {
            tile.numSimplified++;
            ring.push(geom[i], geom[i + 1]);
            for (let j = 3; j < stride; j++) {
                ring.push(geom[i + j]);
            }
        }
        tile.numPoints++;
    }

    if (isPolygon) rewind(ring, isOuter, stride - 1);

    result.push(ring);
}

function rewind(ring, clockwise, dimensions = 2) {
    let area = 0;
    for (let i = 0, len = ring.length, j = len - dimensions; i < len; j = i, i += dimensions) {
        area += (ring[i] - ring[j]) * (ring[i + 1] + ring[j + 1]);
    }
    if (area > 0 === clockwise) {
        for (let i = 0, len = ring.length; i < len / 2; i += dimensions) {
            for (let j = 0; j < dimensions; j++) {
                const a = ring[i + j];
                const rewIndex = len - i - (dimensions - j);
                ring[i + j] = ring[rewIndex];
                ring[rewIndex] = a;
            }
        }
    }
    return ring;
}

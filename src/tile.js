
export default function createTile(features, z, tx, ty, options) {
    const tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
    const z2 = 1 << z;
    const extent = options.extent;
    const tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: features.length,
        source: null,
        x: tx,
        y: ty,
        z,
        minX: 2,
        minY: 1,
        maxX: -1,
        maxY: 0
    };
    for (const feature of features) {
        addFeature(tile, feature, tolerance, options, z2, tx, ty, extent);
    }
    return tile;
}

function projectX(x, z2, tx, extent) {
    return Math.round(extent * (x * z2 - tx));
}

function projectY(y, z2, ty, extent) {
    return Math.round(extent * (y * z2 - ty));
}

function addFeature(tile, feature, tolerance, options, z2, tx, ty, extent) {
    const geom = feature.geometry;
    const type = feature.type;
    const simplified = [];

    tile.minX = Math.min(tile.minX, feature.minX);
    tile.minY = Math.min(tile.minY, feature.minY);
    tile.maxX = Math.max(tile.maxX, feature.maxX);
    tile.maxY = Math.max(tile.maxY, feature.maxY);

    if (type === 'Point' || type === 'MultiPoint') {
        for (let i = 0; i < geom.length; i += 3) {
            simplified.push(projectX(geom[i], z2, tx, extent), projectY(geom[i + 1], z2, ty, extent));
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        addLine(simplified, geom, tile, tolerance, false, z2, tx, ty, extent);

    } else if (type === 'MultiLineString' || type === 'Polygon') {
        for (let i = 0; i < geom.length; i++) {
            addLine(simplified, geom[i], tile, tolerance, type === 'Polygon', z2, tx, ty, extent);
        }

    } else if (type === 'MultiPolygon') {

        for (let k = 0; k < geom.length; k++) {
            const polygon = geom[k];
            for (let i = 0; i < polygon.length; i++) {
                addLine(simplified, polygon[i], tile, tolerance, true, z2, tx, ty, extent);
            }
        }
    }

    if (simplified.length) {
        let tags = feature.tags || null;

        if (type === 'LineString' && options.lineMetrics) {
            tags = {};
            for (const key in feature.tags) tags[key] = feature.tags[key];
            /* eslint-disable dot-notation */
            tags['mapbox_clip_start'] = geom.start / geom.size;
            tags['mapbox_clip_end'] = geom.end / geom.size;
            /* eslint-enable dot-notation */
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

function addLine(result, geom, tile, tolerance, isPolygon, z2, tx, ty, extent) {
    const sqTolerance = tolerance * tolerance;

    if (tolerance > 0 && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += geom.length / 3;
        return;
    }

    const ring = [];

    for (let i = 0; i < geom.length; i += 3) {
        if (tolerance === 0 || geom[i + 2] > sqTolerance) {
            tile.numSimplified++;
            ring.push(projectX(geom[i], z2, tx, extent), projectY(geom[i + 1], z2, ty, extent));
        }
        tile.numPoints++;
    }

    result.push(ring);
}

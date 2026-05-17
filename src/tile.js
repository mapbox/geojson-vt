
import {POINT, LINE, POLYGON, SINGLE_POINT} from './feature.js';

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
    const type = feature.type;

    if (type === SINGLE_POINT) {
        const x = feature.x;
        const y = feature.y;
        if (x < tile.minX) tile.minX = x;
        if (y < tile.minY) tile.minY = y;
        if (x > tile.maxX) tile.maxX = x;
        if (y > tile.maxY) tile.maxY = y;

        tile.numPoints++;
        tile.numSimplified++;

        const tileFeature = {
            geometry: [projectX(x, z2, tx, extent), projectY(y, z2, ty, extent)],
            type: POINT,
            tags: feature.tags || null
        };
        if (feature.id !== null) tileFeature.id = feature.id;
        tile.features.push(tileFeature);
        return;
    }

    const geom = feature.geometry;
    const simplified = [];

    if (feature.minX < tile.minX) tile.minX = feature.minX;
    if (feature.minY < tile.minY) tile.minY = feature.minY;
    if (feature.maxX > tile.maxX) tile.maxX = feature.maxX;
    if (feature.maxY > tile.maxY) tile.maxY = feature.maxY;

    if (type === POINT) {
        for (let i = 0; i < geom.length; i += 3) {
            simplified.push(projectX(geom[i], z2, tx, extent), projectY(geom[i + 1], z2, ty, extent));
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else {
        const isPolygon = type === POLYGON;
        for (let i = 0; i < geom.length;) {
            const ringLen = geom[i];
            const ringSize = geom[i + 1];
            const coords0 = i + 2;
            const coordsEnd = coords0 + ringLen * 3;
            addLine(simplified, geom, coords0, coordsEnd, ringSize, tile, tolerance, isPolygon, z2, tx, ty, extent);
            i = coordsEnd;
        }
    }

    if (!simplified.length) return;

    let tags = feature.tags || null;
    if (type === LINE && options.lineMetrics) {
        tags = {};
        for (const key in feature.tags) tags[key] = feature.tags[key];
        const size = geom[1]; // first ring's ringSize (line length)
        /* eslint-disable camelcase */
        tags.mapbox_clip_start = feature.start / size;
        tags.mapbox_clip_end = feature.end / size;
        /* eslint-enable camelcase */
    }

    // internal type values are intentionally identical to the public ones
    const tileFeature = {geometry: simplified, type, tags};
    if (feature.id !== null) tileFeature.id = feature.id;
    tile.features.push(tileFeature);
}

function addLine(result, geom, coords0, coordsEnd, ringSize, tile, tolerance, isPolygon, z2, tx, ty, extent) {
    const sqTolerance = tolerance * tolerance;

    if (tolerance > 0 && (Math.abs(ringSize) < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += (coordsEnd - coords0) / 3;
        return;
    }

    const ring = [];
    for (let i = coords0; i < coordsEnd; i += 3) {
        if (tolerance === 0 || geom[i + 2] > sqTolerance) {
            tile.numSimplified++;
            ring.push(projectX(geom[i], z2, tx, extent), projectY(geom[i + 1], z2, ty, extent));
        }
        tile.numPoints++;
    }
    result.push(ring);
}

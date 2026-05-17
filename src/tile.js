
import {POINT, LINE, POLYGON, SINGLE_POINT} from './feature.js';

// Below this kept-point count, addLine builds rings as a JS Array (less overhead on tiny rings)
const TYPED_RING_THRESHOLD = 8;

export default function createTile(features, z, tx, ty, options) {
    const tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
    const z2 = 1 << z;
    const extent = options.extent;
    // Pick smallest typed-array dtype that fits projected coord range [-buffer, extent+buffer].
    const CoordArray = (extent + options.buffer) <= 32767 ? Int16Array : Int32Array;
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
        addFeature(tile, feature, tolerance, options, z2, tx, ty, extent, CoordArray);
    }
    return tile;
}

function projectX(x, z2, tx, extent) {
    return Math.round(extent * (x * z2 - tx));
}

function projectY(y, z2, ty, extent) {
    return Math.round(extent * (y * z2 - ty));
}

function addFeature(tile, feature, tolerance, options, z2, tx, ty, extent, CoordArray) {
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
            x: projectX(x, z2, tx, extent),
            y: projectY(y, z2, ty, extent),
            type: SINGLE_POINT,
            tags: feature.tags || null
        };
        if (feature.id !== null) tileFeature.id = feature.id;
        tile.features.push(tileFeature);
        return;
    }

    const geom = feature.geometry;
    let simplified;

    if (feature.minX < tile.minX) tile.minX = feature.minX;
    if (feature.minY < tile.minY) tile.minY = feature.minY;
    if (feature.maxX > tile.maxX) tile.maxX = feature.maxX;
    if (feature.maxY > tile.maxY) tile.maxY = feature.maxY;

    if (type === POINT) {
        const n = geom.length / 3;
        simplified = new CoordArray(n * 2);
        for (let i = 0, j = 0; i < geom.length; i += 3, j += 2) {
            simplified[j] = projectX(geom[i], z2, tx, extent);
            simplified[j + 1] = projectY(geom[i + 1], z2, ty, extent);
        }
        tile.numPoints += n;
        tile.numSimplified += n;
        if (!simplified.length) return;

    } else {
        simplified = [];
        const isPolygon = type === POLYGON;
        for (let i = 0; i < geom.length;) {
            const ringLen = geom[i];
            const ringSize = geom[i + 1];
            const coords0 = i + 2;
            const coordsEnd = coords0 + ringLen * 3;
            addLine(simplified, geom, coords0, coordsEnd, ringSize, tile, tolerance, isPolygon, z2, tx, ty, extent, CoordArray);
            i = coordsEnd;
        }
        if (!simplified.length) return;
    }

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

function addLine(result, geom, coords0, coordsEnd, ringSize, tile, tolerance, isPolygon, z2, tx, ty, extent, CoordArray) {
    const sqTolerance = tolerance * tolerance;
    const ringLen = (coordsEnd - coords0) / 3;

    if (tolerance > 0 && (Math.abs(ringSize) < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += ringLen;
        return;
    }

    // Pre-count kept points so the retained ring is allocated at exact size
    let kept = 0;
    if (tolerance === 0) {
        kept = ringLen;
    } else {
        for (let i = coords0; i < coordsEnd; i += 3) {
            if (geom[i + 2] > sqTolerance) kept++;
        }
    }
    tile.numPoints += ringLen;
    tile.numSimplified += kept;

    // Two fill loops on purpose: a single loop over a polymorphic ring (JS Array | typed)
    // deopts the inner write and costs ~40% on deep polygons.
    if (kept < TYPED_RING_THRESHOLD) {
        // push keeps it PACKED_SMI; pre-sized `new Array(N)` would be HOLEY.
        const ring = [];
        for (let i = coords0; i < coordsEnd; i += 3) {
            if (tolerance === 0 || geom[i + 2] > sqTolerance) {
                ring.push(projectX(geom[i], z2, tx, extent), projectY(geom[i + 1], z2, ty, extent));
            }
        }
        result.push(ring);
    } else {
        const ring = new CoordArray(kept * 2);
        let w = 0;
        for (let i = coords0; i < coordsEnd; i += 3) {
            if (tolerance === 0 || geom[i + 2] > sqTolerance) {
                ring[w++] = projectX(geom[i], z2, tx, extent);
                ring[w++] = projectY(geom[i + 1], z2, ty, extent);
            }
        }
        result.push(ring);
    }
}

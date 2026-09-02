
import {POINT, LINE, POLYGON, SINGLE_POINT} from './feature.js';

/** @import {AnyFeature, CoordArray, InternalOptions as Options, Tile, TileCoordArray, TileCoordArrayCtor, TileFeature, TileFeatureSinglePoint} from './internal.d.ts' */

// `createTile` reads features in *storage space* (the units convert.js established — centered Int32 quanta when
// the Int32 gate passed, or uncentered Float64 source [0,1] otherwise) and projects each coord into the public
// per-tile extent space. `tolerance` is in storage units at the current zoom (linear; z-slot and POLYGON ringSize
// were stored sqrt-linear at convert).

/** @param {AnyFeature[]} features @param {number} z @param {number} tx @param {number} ty @param {Options} options @returns {Tile} */
export default function createTile(features, z, tx, ty, options) {
    const extent = options.extent;
    const S = options.worldScale;
    const O = options.originShift;
    // storage-space tolerance at this zoom: pixel-tolerance scaled to quanta, then narrowed by the current
    // zoom factor. At z=maxZoom this equals options.tolerance in storage units (1 pixel = 1 quantum on the
    // Int32 path; equivalent ratio on the Float64 path).
    const tolerance = z === options.maxZoom ? 0 : options.tolerance * S / ((1 << z) * extent);
    const z2 = 1 << z;
    // Committed-tile coord type: smallest typed-array dtype that fits the tile-extent projected range [-buffer, extent+buffer].
    const CoordArray = (extent + options.buffer) <= 32767 ? Int16Array : Int32Array;
    /** @type {Tile} */
    const tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: features.length,
        source: null,
        x: tx,
        y: ty,
        z,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
    for (const feature of features) {
        addFeature(tile, feature, tolerance, options, z2, tx, ty, extent, CoordArray, S, O);
    }
    return tile;
}

// Project a storage-space x back to tile-extent integer space.
// storage_x / S + O = source_x ∈ [0, 1]; then (source_x * z2 - tx) * extent.
/** @param {number} x @param {number} z2 @param {number} tx @param {number} extent @param {number} S @param {number} O */
function projectX(x, z2, tx, extent, S, O) {
    return Math.round(extent * ((x / S + O) * z2 - tx));
}

/** @param {number} y @param {number} z2 @param {number} ty @param {number} extent @param {number} S @param {number} O */
function projectY(y, z2, ty, extent, S, O) {
    return Math.round(extent * ((y / S + O) * z2 - ty));
}

/** @param {Tile} tile @param {AnyFeature} feature @param {number} tolerance @param {Options} options @param {number} z2 @param {number} tx @param {number} ty @param {number} extent @param {TileCoordArrayCtor} CoordArray @param {number} S @param {number} O */
function addFeature(tile, feature, tolerance, options, z2, tx, ty, extent, CoordArray, S, O) {
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

        /** @type {TileFeatureSinglePoint} */
        const tileFeature = {
            x: projectX(x, z2, tx, extent, S, O),
            y: projectY(y, z2, ty, extent, S, O),
            type: SINGLE_POINT,
            tags: feature.tags || null
        };
        if (feature.id !== undefined) tileFeature.id = feature.id;
        tile.features.push(tileFeature);
        return;
    }

    const geom = feature.geometry;
    /** @type {TileCoordArray | TileCoordArray[]} */
    let simplified;

    if (feature.minX < tile.minX) tile.minX = feature.minX;
    if (feature.minY < tile.minY) tile.minY = feature.minY;
    if (feature.maxX > tile.maxX) tile.maxX = feature.maxX;
    if (feature.maxY > tile.maxY) tile.maxY = feature.maxY;

    if (type === POINT) {
        const n = geom.length / 3;
        simplified = new CoordArray(n * 2);
        for (let i = 0, j = 0; i < geom.length; i += 3, j += 2) {
            simplified[j] = projectX(geom[i], z2, tx, extent, S, O);
            simplified[j + 1] = projectY(geom[i + 1], z2, ty, extent, S, O);
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
            addLine(simplified, geom, coords0, coordsEnd, ringSize, tile, tolerance, isPolygon, z2, tx, ty, extent, CoordArray, S, O);
            i = coordsEnd;
        }
        if (!simplified.length) return;
    }

    let tags = feature.tags || null;
    if (type === LINE && options.lineMetrics) {
        tags = {};
        for (const key in feature.tags) tags[key] = feature.tags[key];
        const size = geom[1]; // first ring's ringSize (line length)
        // start/end are set together by convert/clip on lineMetrics LINE features
        const start = /** @type {number} */ (feature.start);
        const end = /** @type {number} */ (feature.end);
        // Clamp to [0, 1] — the mathematical bounds by definition. On the integer-coord path, `size` is the
        // truncated Int32 length while clip's `feature.end` is a Float64 running sum, so a slice ending at
        // the line end would otherwise emit mapbox_clip_end slightly > 1. A zero-length or sub-quantum line
        // stores `size` 0, and the whole of it is the whole line, so it spans the full [0, 1] range.
        /* eslint-disable camelcase */
        tags.mapbox_clip_start = size > 0 ? Math.max(0, start / size) : 0;
        tags.mapbox_clip_end = size > 0 ? Math.min(1, end / size) : 1;
        /* eslint-enable camelcase */
    }

    // internal type values are intentionally identical to the public ones; the cast bridges the parallel narrowing
    // of `type` (POINT vs LINE/POLYGON) and `simplified` (flat vs ring-array) that TS can't follow across branches.
    const tileFeature = /** @type {TileFeature} */ ({geometry: simplified, type, tags});
    if (feature.id !== undefined) tileFeature.id = feature.id;
    tile.features.push(tileFeature);
}

/** @param {TileCoordArray[]} result @param {CoordArray} geom @param {number} coords0 @param {number} coordsEnd @param {number} ringSize @param {Tile} tile @param {number} tolerance @param {boolean} isPolygon @param {number} z2 @param {number} tx @param {number} ty @param {number} extent @param {TileCoordArrayCtor} CoordArray @param {number} S @param {number} O */
function addLine(result, geom, coords0, coordsEnd, ringSize, tile, tolerance, isPolygon, z2, tx, ty, extent, CoordArray, S, O) {
    const ringLen = (coordsEnd - coords0) / 3;

    if (ringLen === 0) return; // tolerate over-allocated trailing slack from clip's heuristic count

    // z-slot and POLYGON ringSize are stored sqrt-linear, LINE ringSize linear, so both ringSize and per-coord
    // weight compare linearly against tolerance.
    if (tolerance > 0 && Math.abs(ringSize) < tolerance) {
        tile.numPoints += ringLen;
        return;
    }

    // Pre-count kept points so the retained ring is allocated at exact size
    let kept = 0;
    if (tolerance === 0) {
        kept = ringLen;
    } else {
        for (let i = coords0; i < coordsEnd; i += 3) {
            if (geom[i + 2] > tolerance) kept++;
        }
    }
    tile.numPoints += ringLen;
    tile.numSimplified += kept;

    const ring = new CoordArray(kept * 2);
    let w = 0;
    for (let i = coords0; i < coordsEnd; i += 3) {
        if (tolerance === 0 || geom[i + 2] > tolerance) {
            ring[w++] = projectX(geom[i], z2, tx, extent, S, O);
            ring[w++] = projectY(geom[i + 1], z2, ty, extent, S, O);
        }
    }
    result.push(ring);
}

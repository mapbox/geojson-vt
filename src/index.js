
import Converter from './convert.js';
import Clipper from './clip.js';
import wrap from './wrap.js';
import TileBuilder from './tile.js';

/** @typedef {import('geojson').GeoJSON} GeoJSON */
/** @typedef {import('./featureset.js').FeatureSet} FeatureSet */
/** @typedef {import('./featureset.js').SourceData} SourceData */
/** @typedef {import('./featureset.js').Tile} Tile */
/** @typedef {import('./featureset.js').Properties} Properties */
/** @typedef {import('./index.js').Options} Options */
/** @typedef {import('./index.js').TileCoord} TileCoord */
/** @typedef {import('./index.js').LegacyTile} LegacyTile */
/** @typedef {import('./index.js').LegacyFeature} LegacyFeature */
/** @typedef {import('./index.js').RawTile} RawTile */
/** @typedef {Int16ArrayConstructor | Int32ArrayConstructor} CoordCtor */

/** @type {Options} */
const defaultOptions = {
    maxZoom: 14,
    indexMaxZoom: 5,
    indexMaxPoints: 100000,
    tolerance: 3,
    extent: 4096,
    buffer: 64,
    lineMetrics: false,
    promoteId: null,
    generateId: false,
    debug: 0
};

export default class GeoJSONVT {
    /**
     * @param {GeoJSON} data
     * @param {Partial<Options>} [options]
     */
    constructor(data, options) {
        const opts = /** @type {Options} */ (Object.assign({}, defaultOptions, options));
        this.options = opts;

        if (opts.maxZoom < 0 || opts.maxZoom > 24) throw new Error('maxZoom should be in the 0-24 range');
        if (opts.promoteId && opts.generateId) throw new Error('promoteId and generateId cannot be used together.');

        // Pick committed-coord dtype once from extent + buffer (plan §2.2). Tile coords span
        // [-buffer, extent + buffer]; Int16 covers up through extent + buffer ≤ 32767.
        const limit = opts.extent + opts.buffer + 1;
        if (limit > 0x7FFFFFFF) throw new Error('extent + buffer exceeds Int32 range');
        /** @type {CoordCtor} */
        this.CoordCtor = limit <= 0x7FFF ? Int16Array : Int32Array;

        /** @type {Record<number, Tile>} */
        this.tiles = {};
        /** @type {TileCoord[]} */
        this.tileCoords = [];

        const {set, source} = new Converter(opts).run(data);
        /** @type {SourceData} */
        this.source = source;

        const wrapped = wrap(set, source, opts);
        if (wrapped && wrapped.numFeatures > 0) this.splitTile(wrapped, 0, 0, 0);
    }

    /**
     * Splits a FeatureSet into tiles. With (cz, cx, cy) the work is a drilldown toward that
     * target; otherwise it's the first-pass tile build governed by indexMaxZoom/indexMaxPoints.
     *
     * @param {FeatureSet} set @param {number} z @param {number} x @param {number} y
     * @param {number} [cz] @param {number} [cx] @param {number} [cy]
     */
    splitTile(set, z, x, y, cz, cx, cy) {
        const stack = /** @type {(FeatureSet | number)[]} */ ([set, z, x, y]);
        const opts = this.options;
        const lm = !!opts.lineMetrics;

        while (stack.length) {
            y = /** @type {number} */ (stack.pop());
            x = /** @type {number} */ (stack.pop());
            z = /** @type {number} */ (stack.pop());
            set = /** @type {FeatureSet} */ (stack.pop());

            const id = toID(z, x, y);
            let tile = this.tiles[id];
            if (!tile) {
                tile = this.tiles[id] = new TileBuilder(set, this.source, z, x, y, opts, this.CoordCtor).run();
                this.tileCoords.push({z, x, y});
            }
            tile.source = set;                              // retain for drilldown unless we split below

            if (cz === undefined) {
                if (z === opts.indexMaxZoom || tile.numPoints <= opts.indexMaxPoints) continue;
            } else if (z === opts.maxZoom || z === cz) {
                continue;
            } else {
                const zoomSteps = cz - z;
                if (x !== /** @type {number} */ (cx) >> zoomSteps ||
                    y !== /** @type {number} */ (cy) >> zoomSteps) continue;
            }

            tile.source = null;                              // splitting further; drop the source reference

            const z2 = 1 << z;
            const k1 = 0.5 * opts.buffer / opts.extent;
            const k2 = 0.5 - k1;
            const k3 = 0.5 + k1;
            const k4 = 1 + k1;

            const left  = new Clipper(set, this.source, z2, x - k1, x + k3, 0, lm).run();
            const right = new Clipper(set, this.source, z2, x + k2, x + k4, 0, lm).run();

            const tl = left  ? new Clipper(left,  this.source, z2, y - k1, y + k3, 1, lm).run() : null;
            const bl = left  ? new Clipper(left,  this.source, z2, y + k2, y + k4, 1, lm).run() : null;
            const tr = right ? new Clipper(right, this.source, z2, y - k1, y + k3, 1, lm).run() : null;
            const br = right ? new Clipper(right, this.source, z2, y + k2, y + k4, 1, lm).run() : null;

            if (tl) stack.push(tl, z + 1, x * 2,     y * 2);
            if (bl) stack.push(bl, z + 1, x * 2,     y * 2 + 1);
            if (tr) stack.push(tr, z + 1, x * 2 + 1, y * 2);
            if (br) stack.push(br, z + 1, x * 2 + 1, y * 2 + 1);
        }
    }

    /**
     * @param {number} z @param {number} x @param {number} y
     * @returns {LegacyTile | null}
     */
    getTile(z, x, y) {
        const tile = this.findTile(z, x, y);
        return tile ? materializeLegacy(tile, this.source, this.options, +z) : null;
    }

    /**
     * @param {number} z @param {number} x @param {number} y
     * @returns {RawTile | null}
     */
    getTileRaw(z, x, y) {
        const tile = this.findTile(z, x, y);
        return tile ? materializeRaw(tile, this.source) : null;
    }

    /**
     * Wrap-x, look up by id; on miss, drill from the nearest indexed ancestor that still
     * retains a `source` FeatureSet. Returns null if no path leads to (z, x, y).
     *
     * @param {number} z @param {number} x @param {number} y
     * @returns {Tile | null}
     */
    findTile(z, x, y) {
        z = +z; x = +x; y = +y;
        if (z < 0 || z > 24) return null;
        const z2 = 1 << z;
        x = (x + z2) & (z2 - 1);                            // wrap x

        const id = toID(z, x, y);
        if (this.tiles[id]) return this.tiles[id];

        let z0 = z, x0 = x, y0 = y;
        /** @type {Tile | undefined} */
        let parent;
        while (!parent && z0 > 0) {
            z0--;
            x0 = x0 >> 1;
            y0 = y0 >> 1;
            parent = this.tiles[toID(z0, x0, y0)];
        }
        if (!parent || !parent.source) return null;

        this.splitTile(parent.source, z0, x0, y0, z, x, y);
        return this.tiles[id] || null;
    }
}

/** @param {number} z @param {number} x @param {number} y @returns {number} */
function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

/**
 * Walks the committed tile's flat arrays and rebuilds the legacy nested per-feature
 * envelope: `{geometry, type, tags, id?}`. Type 1 (point) emits a flat array of [x, y]
 * pairs; types 2/3 emit array-of-rings, each ring an array of [x, y] pairs.
 *
 * @param {Tile} tile @param {SourceData} source @param {Options} options @param {number} z
 * @returns {LegacyTile}
 */
function materializeLegacy(tile, source, options, z) {
    /** @type {LegacyFeature[]} */
    const features = [];
    const lineMetrics = !!options.lineMetrics;
    const scale = (1 << z) * options.extent;
    const coords = tile.coords;

    for (let i = 0; i < tile.sourceIndices.length; i++) {
        const src = tile.sourceIndices[i];
        const type = /** @type {1 | 2 | 3} */ (source.types[src]);
        const id = source.ids[src];
        const rStart = tile.ringOffsets[i];
        const rEnd = tile.ringOffsets[i + 1];

        /** @type {[number, number][] | [number, number][][]} */
        let geometry;
        if (type === 1) {
            geometry = ringPoints(coords, tile.rings[rStart], tile.rings[rStart + 1]);
        } else {
            /** @type {[number, number][][]} */
            const rings = [];
            for (let r = rStart; r < rEnd; r++) {
                rings.push(ringPoints(coords, tile.rings[r], tile.rings[r + 1]));
            }
            geometry = rings;
        }

        /** @type {Properties} */
        let tags = source.properties[src];
        if (lineMetrics && type === 2 && tile.ringSizes && tile.ringClips) {
            const size  = tile.ringSizes[rStart];
            const start = tile.ringClips[rStart * 2];
            const end   = tile.ringClips[rStart * 2 + 1];
            /* eslint-disable camelcase */
            tags = {
                ...(tags || {}),
                mapbox_clip_start: start / size,
                mapbox_clip_end: end / size,
                mapbox_clip_seg_len: (end - start) * scale,
                mapbox_clip_feature_len: size * scale
            };
            /* eslint-enable camelcase */
        }

        const feature = /** @type {LegacyFeature} */ (/** @type {unknown} */ ({geometry, type, tags}));
        if (!Number.isNaN(id)) feature.id = id;
        features.push(feature);
    }
    return {features};
}

/**
 * @param {Int16Array | Int32Array} coords
 * @param {number} ptStart @param {number} ptEnd
 * @returns {[number, number][]}
 */
function ringPoints(coords, ptStart, ptEnd) {
    /** @type {[number, number][]} */
    const out = new Array(ptEnd - ptStart);
    for (let p = ptStart, k = 0; p < ptEnd; p++, k++) {
        out[k] = [coords[p * 2], coords[p * 2 + 1]];
    }
    return out;
}

/**
 * Zero-copy assembly of the flat envelope: typed-array refs straight from the tile and
 * the index-global source. Consumers treat all typed arrays as immutable.
 *
 * @param {Tile} tile @param {SourceData} source
 * @returns {RawTile}
 */
function materializeRaw(tile, source) {
    /** @type {RawTile} */
    const out = {
        coords: tile.coords,
        rings: tile.rings,
        ringOffsets: tile.ringOffsets,
        sourceIndices: tile.sourceIndices,
        sourceIds: source.ids,
        sourceTypes: source.types,
        sourceProperties: source.properties
    };
    if (tile.ringSizes) out.ringSizes = tile.ringSizes;
    if (tile.ringClips) out.ringClips = tile.ringClips;
    return out;
}

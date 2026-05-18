
import convert from './convert.js'; // GeoJSON conversion and preprocessing
import clip from './clip.js';       // stripe clipping algorithm
import wrap from './wrap.js';       // date line processing
import createTile from './tile.js'; // final simplified tile generation
import {POINT, SINGLE_POINT} from './feature.js';

/** @import {AnyFeature, InternalOptions, Tile} from './internal.d.ts' */
/** @import {Options, LegacyTile, LegacyFeature, TileCoord} from './index.d.ts' */

/** @type {Options} */
const defaultOptions = {
    maxZoom: 14,            // max zoom to preserve detail on
    indexMaxZoom: 5,        // max zoom in the tile index
    indexMaxPoints: 100000, // max number of points per tile in the tile index
    tolerance: 3,           // simplification tolerance (higher means simpler)
    extent: 4096,           // tile extent
    buffer: 64,             // tile buffer on each side
    lineMetrics: false,     // whether to calculate line metrics
    promoteId: null,        // name of a feature property to be promoted to feature.id
    generateId: false,      // whether to generate feature ids. Cannot be used with promoteId
    debug: 0                // logging level (0, 1 or 2)
};

export default class GeoJSONVT {
    /** @param {import('geojson').GeoJSON} data @param {Partial<Options>} [options] */
    constructor(data, options) {
        /** @type {InternalOptions} */
        const opts = this.options = Object.assign(Object.create(defaultOptions), options);

        const debug = opts.debug;

        if (debug) console.time('preprocess data');

        if (opts.maxZoom < 0 || opts.maxZoom > 24) throw new Error('maxZoom should be in the 0-24 range');
        if (opts.promoteId && opts.generateId) throw new Error('promoteId and generateId cannot be used together.');

        // Int32 source-coord gate: world + wrap buffer must fit signed 32-bit. When the gate fails, fall
        // back to Float64Array storage (uncentered [0, 1] source space — historical encoding).
        const worldSpan = (opts.extent + 2 * opts.buffer) * (1 << opts.maxZoom);
        const useInt32 = worldSpan < 0x100000000; // 2^32; strict — centered range is [-2^31, +2^31), and +2^31 wraps under ToInt32.
        opts.useInt32 = useInt32;
        opts.CoordArray = useInt32 ? Int32Array : Float64Array;
        opts.worldScale = useInt32 ? opts.extent * (1 << opts.maxZoom) : 1;
        opts.originShift = useInt32 ? 0.5 : 0;

        // projects and adds simplification info
        let features = convert(data, opts);

        // tiles and tileCoords are part of the public API
        /** @type {Record<number, Tile>} */
        this.tiles = {};
        /** @type {TileCoord[]} */
        this.tileCoords = [];
        /** @type {Record<string, number>} */
        this.stats = {};
        this.total = 0;

        if (debug) {
            console.timeEnd('preprocess data');
            console.log('index: maxZoom: %d, maxPoints: %d', opts.indexMaxZoom, opts.indexMaxPoints);
            console.time('generate tiles');
        }

        // wraps features (ie extreme west and extreme east)
        features = wrap(features, opts);

        // start slicing from the top tile down
        if (features.length) this.splitTile(features, 0, 0, 0);

        if (debug) {
            const top = this.tiles[0];
            if (top) console.log(`features: ${top.numFeatures}, points: ${top.numPoints}`);
            console.timeEnd('generate tiles');
            console.log('tiles generated:', this.total, JSON.stringify(this.stats));
        }
    }

    // Splits features from a parent tile to sub-tiles. z/x/y: parent tile coords; cz/cx/cy: target tile coords.
    //
    // If no target tile is specified, splitting stops when we reach the maximum zoom or when the
    // number of points is low as specified in the options.
    /** @param {AnyFeature[]} features @param {number} z @param {number} x @param {number} y @param {number} [cz] @param {number} [cx] @param {number} [cy] */
    splitTile(features, z, x, y, cz, cx, cy) {

        /** @type {AnyFeature[][]} */
        const featStack = [features];
        /** @type {number[]} */
        const numStack = [z, x, y];
        const options = /** @type {InternalOptions} */ (this.options);
        const debug = options.debug;

        // avoid recursion by using a processing queue
        while (featStack.length) {
            y = /** @type {number} */ (numStack.pop());
            x = /** @type {number} */ (numStack.pop());
            z = /** @type {number} */ (numStack.pop());
            features = /** @type {AnyFeature[]} */ (featStack.pop());

            const z2 = 1 << z;
            const id = toID(z, x, y);
            let tile = this.tiles[id];

            if (!tile) {
                if (debug > 1) console.time('creation');

                tile = this.tiles[id] = createTile(features, z, x, y, options);
                this.tileCoords.push({z, x, y});
                this.stats[z] = (this.stats[z] || 0) + 1;
                this.total++;

                if (debug > 1) {
                    console.log(`tile z${z}-${x}-${y} (features: ${tile.numFeatures}, points: ${tile.numPoints}, simplified: ${tile.numSimplified})`);
                    console.timeEnd('creation');
                }
            }

            // save reference to original geometry in tile so that we can drill down later if we stop now
            tile.source = features;

            // if it's the first-pass tiling
            if (cz == null) {
                // stop tiling if we reached max zoom, or if the tile is too simple
                if (z === options.indexMaxZoom || tile.numPoints <= options.indexMaxPoints) continue;
            // if a drilldown to a specific tile
            } else if (z === options.maxZoom || z === cz) {
                // stop tiling if we reached base zoom or our target tile zoom
                continue;
            } else {
                // cx, cy are always passed together with cz; stop tiling if it's not an ancestor of the target tile
                const zoomSteps = cz - z;
                if (x !== /** @type {number} */(cx) >> zoomSteps || y !== /** @type {number} */(cy) >> zoomSteps) continue;
            }

            // if we slice further down, no need to keep source geometry
            tile.source = null;

            if (features.length === 0) continue;

            if (debug > 1) console.time('clipping');

            // Convert tile-grid clip thresholds to storage space:
            //   source = (gridCoord ± k) / z2
            //   storage = (source - originShift) * worldScale
            // (b is the half-buffer in storage units; tile-step in storage = S/z2.)
            const S = options.worldScale;
            const O = options.originShift;
            const step = S / z2;
            const b = 0.5 * options.buffer * S / (z2 * options.extent);
            const xc = (x / z2 - O) * S; // tile's left edge in storage
            const yc = (y / z2 - O) * S; // tile's top edge in storage

            let tl = null;
            let bl = null;
            let tr = null;
            let br = null;

            const left  = clip(features, xc - b, xc + step / 2 + b, 0, tile.minX, tile.maxX, options);
            const right = clip(features, xc + step / 2 - b, xc + step + b, 0, tile.minX, tile.maxX, options);

            if (left) {
                tl = clip(left, yc - b, yc + step / 2 + b, 1, tile.minY, tile.maxY, options);
                bl = clip(left, yc + step / 2 - b, yc + step + b, 1, tile.minY, tile.maxY, options);
            }

            if (right) {
                tr = clip(right, yc - b, yc + step / 2 + b, 1, tile.minY, tile.maxY, options);
                br = clip(right, yc + step / 2 - b, yc + step + b, 1, tile.minY, tile.maxY, options);
            }

            if (debug > 1) console.timeEnd('clipping');

            featStack.push(tl || [], bl || [], tr || [], br || []);
            numStack.push(
                z + 1, x * 2, y * 2,
                z + 1, x * 2, y * 2 + 1,
                z + 1, x * 2 + 1, y * 2,
                z + 1, x * 2 + 1, y * 2 + 1);
        }
    }

    /** @param {number|string} z @param {number|string} x @param {number|string} y @returns {LegacyTile|null} */
    getTile(z, x, y) {
        z = +z;
        x = +x;
        y = +y;

        const options = /** @type {InternalOptions} */ (this.options);
        const debug = options.debug;

        if (z < 0 || z > 24) return null;

        const z2 = 1 << z;
        x = (x + z2) & (z2 - 1); // wrap tile x coordinate

        const id = toID(z, x, y);
        if (this.tiles[id]) return materializeTile(this.tiles[id]);

        if (debug > 1) console.log('drilling down to z%d-%d-%d', z, x, y);

        let z0 = z;
        let x0 = x;
        let y0 = y;
        let parent;

        while (!parent && z0 > 0) {
            z0--;
            x0 = x0 >> 1;
            y0 = y0 >> 1;
            parent = this.tiles[toID(z0, x0, y0)];
        }

        if (!parent || !parent.source) return null;

        // if we found a parent tile containing the original geometry, we can drill down from it
        if (debug > 1) {
            console.log('found parent tile z%d-%d-%d', z0, x0, y0);
            console.time('drilling down');
        }
        this.splitTile(parent.source, z0, x0, y0, z, x, y);
        if (debug > 1) console.timeEnd('drilling down');

        return this.tiles[id] ? materializeTile(this.tiles[id]) : null;
    }
}

// Walks the retained internal tile (flat integer coord arrays) into the legacy nested envelope: [x, y] pairs
// grouped per ring. The tile is immutable; each call produces a fresh envelope.
/** @param {Tile} tile @returns {LegacyTile} */
function materializeTile(tile) {
    /** @type {LegacyFeature[]} */
    const features = [];
    for (const f of tile.features) {
        /** @type {LegacyFeature} */
        let legacy;
        if (f.type === SINGLE_POINT) { // narrow to public POINT envelope
            legacy = {type: POINT, geometry: [[f.x, f.y]], tags: f.tags ?? null};
        } else if (f.type === POINT) {
            legacy = {type: POINT, geometry: flatToPairs(f.geometry), tags: f.tags ?? null};
        } else {
            legacy = {type: f.type, geometry: f.geometry.map(flatToPairs), tags: f.tags ?? null};
        }
        if (f.id != null) legacy.id = f.id;
        features.push(legacy);
    }
    return {features};
}

/** @param {import('./internal.d.ts').TileCoordArray} flat @returns {[number, number][]} */
function flatToPairs(flat) {
    /** @type {[number, number][]} */
    const pairs = [];
    for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
    return pairs;
}

/** @param {number} z @param {number} x @param {number} y */
function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

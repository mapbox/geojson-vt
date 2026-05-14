
/** @typedef {import('./featureset.js').FeatureSet} FeatureSet */
/** @typedef {import('./featureset.js').SourceData} SourceData */
/** @typedef {import('./featureset.js').Tile} Tile */
/** @typedef {import('./index.js').Options} Options */
/** @typedef {Int16ArrayConstructor | Int32ArrayConstructor} CoordCtor */

/*
 * Finalizes a per-tile FeatureSet into the committed Tile shape: applies the small-ring drop
 * filter (lines under tolerance, polygons under sqTolerance), applies the Douglas–Peucker
 * survival filter (point's z importance > sqTolerance, or `tolerance === 0` at maxZoom keeps
 * everything), projects coords from mercator [0,1] into integer tile-extent space, strips z,
 * and commits to tight typed arrays (Int16/Int32 coords, Uint32 indices, Float32 metrics).
 *
 * Two passes: scan counts surviving features/rings/points so typed arrays are sized exactly
 * (no double-buffered Array→typed copy peak). Write does the projection + commit.
 */
class TileBuilder {
    /**
     * @param {FeatureSet} set
     * @param {SourceData} source
     * @param {number} z @param {number} tx @param {number} ty
     * @param {Options} options
     * @param {CoordCtor} CoordCtor
     */
    constructor(set, source, z, tx, ty, options, CoordCtor) {
        this.set = set;
        this.source = source;
        this.tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
        this.sqTolerance = this.tolerance * this.tolerance;
        this.CoordCtor = CoordCtor;
        this.z2 = 1 << z;
        this.tx = tx;
        this.ty = ty;
        this.extent = options.extent;
    }

    /** @returns {Tile} */
    build() {
        const {numFeatures, numRings, numKeptPoints} = this.scan();

        const coords         = new this.CoordCtor(numKeptPoints * 2);
        const rings          = new Uint32Array(numRings + 1);
        const ringOffsets    = new Uint32Array(numFeatures + 1);
        const sourceIndices  = new Uint32Array(numFeatures);
        const ringSizes      = this.set.ringSizes !== undefined ? new Float32Array(numRings)     : null;
        const ringClips      = this.set.ringClips !== undefined ? new Float32Array(numRings * 2) : null;

        this.write(coords, rings, ringOffsets, sourceIndices, ringSizes, ringClips);

        /** @type {Tile} */
        const tile = {
            coords, rings, ringOffsets, sourceIndices,
            numPoints: this.set.coords.length / 3,  // input-count heuristic for splitTile
            source: null
        };
        if (ringSizes) tile.ringSizes = ringSizes;
        if (ringClips) tile.ringClips = ringClips;
        return tile;
    }

    /**
     * Pass 1: count surviving features/rings/kept-points after both filters.
     * @returns {{numFeatures: number, numRings: number, numKeptPoints: number}}
     */
    scan() {
        const set = this.set, types = this.source.types;
        let nF = 0, nR = 0, nP = 0;

        for (let i = 0; i < set.numFeatures; i++) {
            const type = types[set.sourceIndices[i]];
            const rStart = set.ringOffsets[i], rEnd = set.ringOffsets[i + 1];
            let fRings = 0, fPoints = 0;
            for (let r = rStart; r < rEnd; r++) {
                if (this.ringDropped(type, r)) continue;
                const pts = this.countKept(type, set.rings[r] * 3, set.rings[r + 1] * 3);
                if (pts === 0) continue;
                fRings++;
                fPoints += pts;
            }
            if (fRings > 0) { nF++; nR += fRings; nP += fPoints; }
        }
        return {numFeatures: nF, numRings: nR, numKeptPoints: nP};
    }

    /**
     * Pass 2: project + project-rounded + filter, written straight into the committed buffers.
     * @param {Int16Array | Int32Array} coords
     * @param {Uint32Array} rings @param {Uint32Array} ringOffsets @param {Uint32Array} sourceIndices
     * @param {Float32Array | null} ringSizes @param {Float32Array | null} ringClips
     */
    write(coords, rings, ringOffsets, sourceIndices, ringSizes, ringClips) {
        const set = this.set, types = this.source.types;
        const z2 = this.z2, tx = this.tx, ty = this.ty, extent = this.extent;
        const sqT = this.sqTolerance, dropZ = this.tolerance !== 0;
        const srcSizes = /** @type {number[] | undefined} */ (set.ringSizes);
        const srcClips = /** @type {number[] | undefined} */ (set.ringClips);
        let cIdx = 0, rIdx = 0, fIdx = 0;

        for (let i = 0; i < set.numFeatures; i++) {
            const type = types[set.sourceIndices[i]];
            const rStart = set.ringOffsets[i], rEnd = set.ringOffsets[i + 1];
            const fStartR = rIdx;
            for (let r = rStart; r < rEnd; r++) {
                if (this.ringDropped(type, r)) continue;
                const ringStart = cIdx >> 1;
                const c3a = set.rings[r] * 3, c3b = set.rings[r + 1] * 3;
                const filter = dropZ && type !== 1;
                for (let c = c3a; c < c3b; c += 3) {
                    if (filter && set.coords[c + 2] <= sqT) continue;
                    coords[cIdx++] = Math.round(extent * (set.coords[c]     * z2 - tx));
                    coords[cIdx++] = Math.round(extent * (set.coords[c + 1] * z2 - ty));
                }
                if ((cIdx >> 1) === ringStart) continue;  // simplification emptied the ring
                rings[rIdx] = ringStart;
                if (ringSizes && srcSizes) ringSizes[rIdx] = srcSizes[r];
                if (ringClips && srcClips) {
                    ringClips[rIdx * 2]     = srcClips[r * 2];
                    ringClips[rIdx * 2 + 1] = srcClips[r * 2 + 1];
                }
                rIdx++;
            }
            if (rIdx === fStartR) continue;               // all this feature's rings dropped
            ringOffsets[fIdx] = fStartR;
            sourceIndices[fIdx] = set.sourceIndices[i];
            fIdx++;
        }
        rings[rIdx] = cIdx >> 1;        // trailing point-count sentinel
        ringOffsets[fIdx] = rIdx;       // trailing ring-count sentinel
    }

    /**
     * Small-ring drop: lines whose original length is under tolerance, polygons whose
     * |signed area| is under sqTolerance. Points and pure-point sets never drop.
     * @param {number} type @param {number} r
     * @returns {boolean}
     */
    ringDropped(type, r) {
        if (this.tolerance === 0 || type === 1) return false;
        const sizes = this.set.ringSizes;
        if (sizes === undefined) return false;
        return sizes[r] < (type === 3 ? this.sqTolerance : this.tolerance);
    }

    /**
     * Counts points that pass the Douglas–Peucker survival filter within one ring.
     * @param {number} type @param {number} c3a @param {number} c3b
     * @returns {number}
     */
    countKept(type, c3a, c3b) {
        if (type === 1 || this.tolerance === 0) return (c3b - c3a) / 3;
        const coords = this.set.coords;
        const sqT = this.sqTolerance;
        let n = 0;
        for (let c = c3a; c < c3b; c += 3) if (coords[c + 2] > sqT) n++;
        return n;
    }
}

/**
 * @param {FeatureSet} set @param {SourceData} source
 * @param {number} z @param {number} tx @param {number} ty
 * @param {Options} options
 * @param {CoordCtor} CoordCtor
 * @returns {Tile}
 */
export default function createTile(set, source, z, tx, ty, options, CoordCtor) {
    return new TileBuilder(set, source, z, tx, ty, options, CoordCtor).build();
}

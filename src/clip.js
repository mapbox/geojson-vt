
/** @typedef {import('./featureset.js').FeatureSet} FeatureSet */
/** @typedef {import('./featureset.js').SourceData} SourceData */

/* Clips a FeatureSet between two axis-parallel lines (k1, k2). Sutherland-Hodgman for
 * polygons (one closed output ring per input ring); per-segment slice for lines (one
 * input ring can produce multiple output rings, or under lineMetrics multiple features).
 *
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */
class Clipper {
    /**
     * @param {FeatureSet} inSet
     * @param {SourceData} source
     * @param {number} scale   z2 = 1 << z; k1/k2 are in tile coords and get divided down
     * @param {number} k1
     * @param {number} k2
     * @param {0 | 1} axis     0 = x, 1 = y
     * @param {boolean} lineMetrics
     */
    constructor(inSet, source, scale, k1, k2, axis, lineMetrics) {
        this.inSet = inSet;
        this.source = source;
        this.k1 = k1 / scale;
        this.k2 = k2 / scale;
        this.axis = axis;
        this.lineMetrics = lineMetrics;

        /** @type {FeatureSet} */
        this.set = {
            coords: [], rings: [], ringOffsets: [], sourceIndices: [], bboxes: [],
            bounds: [Infinity, Infinity, -Infinity, -Infinity],
            numFeatures: 0
        };
        /** @type {number[] | null} */ this.ringSizes = inSet.ringSizes !== undefined ? [] : null;
        /** @type {number[] | null} */ this.ringClips = inSet.ringClips !== undefined ? [] : null;

        // per-feature bbox scratch — reset by startFeature, drained by finishFeature
        this.fMinX = 0; this.fMinY = 0; this.fMaxX = 0; this.fMaxY = 0;
        // snapshot for finishFeature's abort-on-empty check
        this.snapRingsLen = 0;
    }

    /** @returns {FeatureSet | null} */
    run() {
        const lo = this.inSet.bounds[this.axis];
        const hi = this.inSet.bounds[this.axis + 2];
        if (lo >= this.k1 && hi < this.k2) return this.inSet;   // whole-set trivial accept (shared reference)
        if (hi < this.k1 || lo >= this.k2) return null;          // whole-set trivial reject

        for (let i = 0; i < this.inSet.numFeatures; i++) this.clipFeature(i);

        const set = this.set;
        if (set.numFeatures === 0) return null;
        set.rings.push(set.coords.length / 3);          // trailing point-count sentinel
        set.ringOffsets.push(set.rings.length - 1);     // trailing ring-count sentinel
        if (this.ringSizes !== null) set.ringSizes = this.ringSizes;
        if (this.ringClips !== null) set.ringClips = this.ringClips;
        return set;
    }

    /** @param {number} i input feature index */
    clipFeature(i) {
        const inSet = this.inSet;
        const axis = this.axis, k1 = this.k1, k2 = this.k2;
        const bb = i * 4;
        const fMin = inSet.bboxes[bb + axis];
        const fMax = inSet.bboxes[bb + axis + 2];

        if (fMax < k1 || fMin >= k2) return;            // per-feature trivial reject

        const srcIdx = inSet.sourceIndices[i];
        const rStart = inSet.ringOffsets[i];
        const rEnd = inSet.ringOffsets[i + 1];

        if (fMin >= k1 && fMax < k2) {                  // per-feature trivial accept: bulk-copy
            this.copyFeature(i, srcIdx, rStart, rEnd);
            return;
        }

        const type = this.source.types[srcIdx];         // 1=point, 2=line, 3=polygon
        if (type === 1) {
            this.startFeature(srcIdx);
            this.clipPointsRing(inSet.rings[rStart] * 3, inSet.rings[rStart + 1] * 3);
            this.finishFeature();

        } else if (type === 2 && this.lineMetrics) {
            // explode: each surviving slice becomes its own feature sharing srcIdx
            for (let r = rStart; r < rEnd; r++) this.clipRing(r, false, true, srcIdx);

        } else {
            // single output feature with all surviving rings concatenated
            this.startFeature(srcIdx);
            const isPolygon = type === 3;
            for (let r = rStart; r < rEnd; r++) this.clipRing(r, isPolygon, false, srcIdx);
            this.finishFeature();
        }
    }

    /** Bulk-copy a feature whose bbox lies wholly inside [k1, k2]. */
    copyFeature(i, srcIdx, rStart, rEnd) {
        const inSet = this.inSet, set = this.set;
        const baseRing = inSet.rings[rStart];
        const baseCoord3 = baseRing * 3;
        const coordEnd3 = inSet.rings[rEnd] * 3;
        const outRingBase = set.coords.length / 3;

        set.ringOffsets.push(set.rings.length);
        set.sourceIndices.push(srcIdx);

        for (let r = rStart; r < rEnd; r++) {
            set.rings.push(inSet.rings[r] - baseRing + outRingBase);
            if (this.ringSizes !== null) this.ringSizes.push(/** @type {number[]} */(inSet.ringSizes)[r]);
            if (this.ringClips !== null) {
                const rc = /** @type {number[]} */ (inSet.ringClips);
                this.ringClips.push(rc[r * 2], rc[r * 2 + 1]);
            }
        }
        for (let c = baseCoord3; c < coordEnd3; c++) set.coords.push(inSet.coords[c]);

        const minX = inSet.bboxes[i * 4],     minY = inSet.bboxes[i * 4 + 1];
        const maxX = inSet.bboxes[i * 4 + 2], maxY = inSet.bboxes[i * 4 + 3];
        set.bboxes.push(minX, minY, maxX, maxY);
        this.expandBounds(minX, minY, maxX, maxY);
        set.numFeatures++;
    }

    /** Filter-only ring for point features; emits one output ring if any survive. */
    clipPointsRing(r3a, r3b) {
        const inSet = this.inSet, set = this.set;
        const axis = this.axis, k1 = this.k1, k2 = this.k2;
        const sliceStart3 = set.coords.length;
        for (let i = r3a; i < r3b; i += 3) {
            const a = inSet.coords[i + axis];
            if (a >= k1 && a <= k2) {
                const x = inSet.coords[i], y = inSet.coords[i + 1];
                set.coords.push(x, y, inSet.coords[i + 2]);
                this.updateBBox(x, y);
            }
        }
        if (set.coords.length === sliceStart3) return;
        set.rings.push(sliceStart3 / 3);
        if (this.ringSizes !== null) this.ringSizes.push(0);
        if (this.ringClips !== null) this.ringClips.push(0, 0);
    }

    /**
     * Walks one input ring, emitting one (polygon) or zero+ (line) output rings.
     * For lines under lineMetrics, each emitted slice becomes its own feature (explodePerSlice).
     *
     * @param {number} r input ring index
     * @param {boolean} isPolygon
     * @param {boolean} explodePerSlice line-only: emit each slice as a separate feature
     * @param {number} srcIdx source-row index for explode case
     */
    clipRing(r, isPolygon, explodePerSlice, srcIdx) {
        const inSet = this.inSet, set = this.set;
        const axis = this.axis, k1 = this.k1, k2 = this.k2;
        const trackMetrics = this.lineMetrics && !isPolygon;

        const r3a = inSet.rings[r] * 3;
        const r3b = inSet.rings[r + 1] * 3;
        const origSize = /** @type {number[]} */ (inSet.ringSizes)[r];

        let sliceStarted = false;
        let sliceStart3 = 0;       // coords index where the current output ring begins (for polygon closure)
        let sliceClipStart = 0;    // along-line distance at slice start (lineMetrics)
        let curLen = trackMetrics ? /** @type {number[]} */ (inSet.ringClips)[r * 2] : 0;

        for (let i = r3a; i < r3b - 3; i += 3) {
            const ax = inSet.coords[i],     ay = inSet.coords[i + 1], az = inSet.coords[i + 2];
            const bx = inSet.coords[i + 3], by = inSet.coords[i + 4];
            const a = axis === 0 ? ax : ay;
            const b = axis === 0 ? bx : by;
            const segLen = trackMetrics ? Math.hypot(ax - bx, ay - by) : 0;

            if (a < k1) {
                if (b >= k1) {                          // entry from left
                    if (!sliceStarted) { sliceStart3 = this.beginSlice(srcIdx, explodePerSlice); sliceClipStart = curLen; sliceStarted = true; }
                    const t = this.intersect(ax, ay, bx, by, k1);
                    if (trackMetrics) sliceClipStart = curLen + segLen * t;
                }
            } else if (a > k2) {
                if (b <= k2) {                          // entry from right
                    if (!sliceStarted) { sliceStart3 = this.beginSlice(srcIdx, explodePerSlice); sliceClipStart = curLen; sliceStarted = true; }
                    const t = this.intersect(ax, ay, bx, by, k2);
                    if (trackMetrics) sliceClipStart = curLen + segLen * t;
                }
            } else {                                    // a is inside; write verbatim
                if (!sliceStarted) { sliceStart3 = this.beginSlice(srcIdx, explodePerSlice); sliceClipStart = curLen; sliceStarted = true; }
                set.coords.push(ax, ay, az);
                this.updateBBox(ax, ay);
            }

            // exit checks: both fire on a straight-through (a outside-left, b outside-right)
            let exitT = -1;
            if (b < k1 && a >= k1) exitT = this.intersect(ax, ay, bx, by, k1);
            else if (b > k2 && a <= k2) exitT = this.intersect(ax, ay, bx, by, k2);

            if (exitT >= 0 && !isPolygon && sliceStarted) {
                this.commitSlice(origSize, sliceClipStart, trackMetrics ? curLen + segLen * exitT : 0);
                if (explodePerSlice) this.finishFeature();
                sliceStarted = false;
            }

            curLen += segLen;
        }

        // last point of input ring
        const last = r3b - 3;
        const lastA = axis === 0 ? inSet.coords[last] : inSet.coords[last + 1];
        if (lastA >= k1 && lastA <= k2) {
            if (!sliceStarted) { sliceStart3 = this.beginSlice(srcIdx, explodePerSlice); sliceClipStart = curLen; sliceStarted = true; }
            const x = inSet.coords[last], y = inSet.coords[last + 1];
            set.coords.push(x, y, inSet.coords[last + 2]);
            this.updateBBox(x, y);
        }

        // close any open slice
        if (sliceStarted) {
            if (isPolygon) {
                const last3 = set.coords.length - 3;
                if (last3 > sliceStart3 &&
                    (set.coords[sliceStart3] !== set.coords[last3] || set.coords[sliceStart3 + 1] !== set.coords[last3 + 1])) {
                    set.coords.push(set.coords[sliceStart3], set.coords[sliceStart3 + 1], set.coords[sliceStart3 + 2]);
                }
                this.commitSlice(origSize, 0, 0);
            } else {
                this.commitSlice(origSize, sliceClipStart, trackMetrics ? curLen : 0);
                if (explodePerSlice) this.finishFeature();
            }
        }
    }

    /**
     * Marks the start of an output ring; under explodePerSlice also opens a fresh feature.
     * @param {number} srcIdx
     * @param {boolean} explodePerSlice
     * @returns {number} coord-array index where this ring begins (for polygon-closure use)
     */
    beginSlice(srcIdx, explodePerSlice) {
        if (explodePerSlice) this.startFeature(srcIdx);
        const start3 = this.set.coords.length;
        this.set.rings.push(start3 / 3);
        return start3;
    }

    /**
     * Commits per-ring metadata (size + clip range). Caller handles finishFeature for explode.
     * @param {number} origSize @param {number} clipStart @param {number} clipEnd
     */
    commitSlice(origSize, clipStart, clipEnd) {
        if (this.ringSizes !== null) this.ringSizes.push(origSize);
        if (this.ringClips !== null) this.ringClips.push(clipStart, clipEnd);
    }

    /** @param {number} srcIdx */
    startFeature(srcIdx) {
        this.set.ringOffsets.push(this.set.rings.length);
        this.set.sourceIndices.push(srcIdx);
        this.snapRingsLen = this.set.rings.length;
        this.fMinX = Infinity; this.fMinY = Infinity;
        this.fMaxX = -Infinity; this.fMaxY = -Infinity;
    }

    /** Commits the in-flight feature; aborts (rolls back ringOffsets/sourceIndices) if no rings were emitted. */
    finishFeature() {
        const set = this.set;
        if (set.rings.length === this.snapRingsLen) {
            set.ringOffsets.pop();
            set.sourceIndices.pop();
            return;
        }
        set.bboxes.push(this.fMinX, this.fMinY, this.fMaxX, this.fMaxY);
        this.expandBounds(this.fMinX, this.fMinY, this.fMaxX, this.fMaxY);
        set.numFeatures++;
    }

    /** @param {number} x @param {number} y */
    updateBBox(x, y) {
        if (x < this.fMinX) this.fMinX = x;
        if (y < this.fMinY) this.fMinY = y;
        if (x > this.fMaxX) this.fMaxX = x;
        if (y > this.fMaxY) this.fMaxY = y;
    }

    /** @param {number} minX @param {number} minY @param {number} maxX @param {number} maxY */
    expandBounds(minX, minY, maxX, maxY) {
        const b = this.set.bounds;
        if (minX < b[0]) b[0] = minX;
        if (minY < b[1]) b[1] = minY;
        if (maxX > b[2]) b[2] = maxX;
        if (maxY > b[3]) b[3] = maxY;
    }

    /**
     * Pushes a clip-intersection point (z = 1, preserves through simplification) to outSet.coords
     * and updates bbox. Returns the segment parameter t ∈ [0, 1] for along-line metric calculation.
     * @returns {number}
     */
    intersect(ax, ay, bx, by, k) {
        let x, y, t;
        if (this.axis === 0) {
            t = (k - ax) / (bx - ax);
            x = k;
            y = ay + (by - ay) * t;
        } else {
            t = (k - ay) / (by - ay);
            x = ax + (bx - ax) * t;
            y = k;
        }
        this.set.coords.push(x, y, 1);
        this.updateBBox(x, y);
        return t;
    }
}

export default Clipper;

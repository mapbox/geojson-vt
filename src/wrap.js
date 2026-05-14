
import clip from './clip.js';

/** @typedef {import('./featureset.js').FeatureSet} FeatureSet */
/** @typedef {import('./featureset.js').SourceData} SourceData */
/** @typedef {import('./index.js').Options} Options */

/*
 * Antimeridian handling. Clips up to three "world copies" of the source set
 *   left   x ∈ [-1 - buffer, buffer]
 *   center x ∈ [-buffer,     1 + buffer]
 *   right  x ∈ [1 - buffer,  2 + buffer]
 * shifts side copies into the center frame, then merges the survivors into
 * one FeatureSet for downstream splitTile. Common case: input already fits
 * in the buffered center — both side clips reject and the input is returned
 * unmodified (shared reference).
 */

/**
 * @param {FeatureSet} set
 * @param {SourceData} source
 * @param {Options} options
 * @returns {FeatureSet | null}
 */
export default function wrap(set, source, options) {
    const buffer = options.buffer / options.extent;
    const lm = !!options.lineMetrics;

    const left  = clip(set, source, 1, -1 - buffer, buffer,     0, lm);
    const right = clip(set, source, 1,  1 - buffer, 2 + buffer, 0, lm);

    if (left === null && right === null) return set;            // already fits in center

    const center = clip(set, source, 1, -buffer, 1 + buffer, 0, lm);

    /** @type {FeatureSet[]} */
    const parts = [];
    if (left)   parts.push(shiftFeatureSet(left,   1));
    if (center) parts.push(center);
    if (right)  parts.push(shiftFeatureSet(right, -1));

    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return mergeFeatureSets(parts);
}

/**
 * Returns a new FeatureSet with x-coords + offset applied. rings, ringOffsets,
 * sourceIndices, ringSizes, ringClips are shared (immutable post-build);
 * coords/bboxes/bounds are owned (the input may be a trivial-accept share of
 * the original set — mutating in place would alias-corrupt it).
 * @param {FeatureSet} set @param {number} offset
 * @returns {FeatureSet}
 */
function shiftFeatureSet(set, offset) {
    const inCoords = set.coords;
    const coords = new Array(inCoords.length);
    for (let i = 0; i < inCoords.length; i += 3) {
        coords[i]     = inCoords[i] + offset;
        coords[i + 1] = inCoords[i + 1];
        coords[i + 2] = inCoords[i + 2];
    }
    const inBB = set.bboxes;
    const bboxes = new Array(inBB.length);
    for (let i = 0; i < inBB.length; i += 4) {
        bboxes[i]     = inBB[i] + offset;
        bboxes[i + 1] = inBB[i + 1];
        bboxes[i + 2] = inBB[i + 2] + offset;
        bboxes[i + 3] = inBB[i + 3];
    }
    const b = set.bounds;
    /** @type {FeatureSet} */
    const out = {
        coords,
        rings: set.rings,
        ringOffsets: set.ringOffsets,
        sourceIndices: set.sourceIndices,
        bboxes,
        bounds: [b[0] + offset, b[1], b[2] + offset, b[3]],
        numFeatures: set.numFeatures
    };
    if (set.ringSizes !== undefined) out.ringSizes = set.ringSizes;
    if (set.ringClips !== undefined) out.ringClips = set.ringClips;
    return out;
}

/**
 * Concatenates 2+ FeatureSets into one. coords / bboxes / sourceIndices /
 * ringSizes / ringClips are straight concats; rings and ringOffsets get the
 * skip-trailing-sentinel + offset-adjust + emit-final-sentinel pattern.
 * All inputs share the same optional-field presence (they come from clipping
 * the same source set with identical lineMetrics).
 * @param {FeatureSet[]} sets
 * @returns {FeatureSet}
 */
function mergeFeatureSets(sets) {
    const hasRingSizes = sets[0].ringSizes !== undefined;
    const hasRingClips = sets[0].ringClips !== undefined;

    /** @type {FeatureSet} */
    const out = {
        coords: [], rings: [], ringOffsets: [], sourceIndices: [], bboxes: [],
        bounds: [Infinity, Infinity, -Infinity, -Infinity],
        numFeatures: 0
    };
    /** @type {number[] | undefined} */ const ringSizes = hasRingSizes ? [] : undefined;
    /** @type {number[] | undefined} */ const ringClips = hasRingClips ? [] : undefined;

    let coordCount = 0;  // running point count across merged sets
    let ringCount = 0;   // running ring count across merged sets

    for (const s of sets) {
        const sc = s.coords;
        for (let j = 0; j < sc.length; j++) out.coords.push(sc[j]);
        const sb = s.bboxes;
        for (let j = 0; j < sb.length; j++) out.bboxes.push(sb[j]);
        const si = s.sourceIndices;
        for (let j = 0; j < si.length; j++) out.sourceIndices.push(si[j]);
        if (ringSizes) {
            const ss = /** @type {number[]} */ (s.ringSizes);
            for (let j = 0; j < ss.length; j++) ringSizes.push(ss[j]);
        }
        if (ringClips) {
            const rc = /** @type {number[]} */ (s.ringClips);
            for (let j = 0; j < rc.length; j++) ringClips.push(rc[j]);
        }

        // Skip each set's trailing sentinel; the next set's first entry (or our
        // final emit below) takes its place.
        const sr = s.rings;
        for (let j = 0; j < sr.length - 1; j++) out.rings.push(sr[j] + coordCount);
        const so = s.ringOffsets;
        for (let j = 0; j < so.length - 1; j++) out.ringOffsets.push(so[j] + ringCount);

        coordCount += sc.length / 3;
        ringCount  += sr.length - 1;
        out.numFeatures += s.numFeatures;

        const bs = s.bounds, bo = out.bounds;
        if (bs[0] < bo[0]) bo[0] = bs[0];
        if (bs[1] < bo[1]) bo[1] = bs[1];
        if (bs[2] > bo[2]) bo[2] = bs[2];
        if (bs[3] > bo[3]) bo[3] = bs[3];
    }
    out.rings.push(coordCount);          // trailing point-count sentinel
    out.ringOffsets.push(ringCount);     // trailing ring-count sentinel

    if (ringSizes) out.ringSizes = ringSizes;
    if (ringClips) out.ringClips = ringClips;
    return out;
}

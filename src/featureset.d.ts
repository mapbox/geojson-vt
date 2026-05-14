// Internal SoA shapes used across JS source via JSDoc `import('./featureset.js')`.
// Not re-exported from index.d.ts.

export type Properties = Record<string, any> | null;

// Index-global; allocated once in convert(), referenced from every FeatureSet via sourceIndices.
export interface SourceData {
    types: Uint8Array;        // 1=point, 2=line, 3=polygon
    ids: Float64Array;        // NaN = absent
    properties: Properties[];
}

// Transient per-stage batch — output of convert, threaded through wrap and clip, finalized by createTile.
// Plain Arrays in transit: V8 backs homogeneous numerics with packed doubles/SMIs (same density as typed
// arrays) so per-stage counts don't need to be known upfront. Indexing:
//
//   feature i ∈ [0, numFeatures):  rings  = [ringOffsets[i] .. ringOffsets[i+1])
//                                  bbox   = bboxes[i*4 .. i*4+4]
//                                  source = sourceIndices[i]
//   ring r ∈ [0, numRings):        points = [rings[r] .. rings[r+1])               (point-indexed)
//                                  coords = coords[rings[r]*3 .. rings[r+1]*3]     (stride 3)
export interface FeatureSet {
    coords: number[];                         // flat (x, y, z) triples
    rings: number[];                          // length numRings + 1 (trailing sentinel)
    ringSizes?: number[];                     // line length or |signed area|; omitted for point-only sets
    ringClips?: number[];                     // (start, end) per ring, stride 2; lineMetrics only

    numFeatures: number;
    ringOffsets: number[];                    // length numFeatures + 1 (trailing sentinel)
    bboxes: number[];                         // (minX, minY, maxX, maxY) per feature, stride 4
    bounds: [number, number, number, number]; // aggregate bbox; drives whole-set clip early-out
    sourceIndices: number[];
}

// Committed per-tile geometry stored in index.tiles[id]. Built once in createTile; immutable thereafter,
// except `source` is nulled when the tile splits further. Same SoA shape as FeatureSet but committed to
// tight typed arrays; source data lives once on the index, referenced via sourceIndices.
export interface Tile {
    coords: Int16Array | Int32Array;          // (x, y) pairs; Int16 unless extent + buffer exceeds it
    rings: Uint32Array;
    ringOffsets: Uint32Array;
    sourceIndices: Uint32Array;
    ringSizes?: Float32Array;
    ringClips?: Float32Array;

    numPoints: number;                        // drives the indexMaxPoints heuristic in splitTile
    source: FeatureSet | null;                // pre-createTile FeatureSet, retained for drilldown
}

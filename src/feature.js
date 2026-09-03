
// Internal feature type tags. The first three match MVT output types (and the legacy envelope's numeric
// `type` field); SINGLE_POINT is an internal-only specialization that tile.js maps back to POINT in public output.
//
//   POINT (1)        — MultiPoint (and Point with >1 coord): flat [x,y,z, ...]
//   LINE (2)         — LineString / MultiLineString:         inline-header rings
//   POLYGON (3)      — Polygon / MultiPolygon:               inline-header rings
//   SINGLE_POINT (4) — single-Point specialization:          {x, y} on the feature
//
// Polygon outer-vs-hole is encoded by winding order (canonicalized in convert) AND by the sign of the
// ring's stored `ringSize` — so Polygon and MultiPolygon share one flat ring list.
//
// Inline-header layout for LINE / POLYGON geometry:
//     [ringLen, ringSize, x,y,z, ..., ringLen, ringSize, x,y,z, ..., ...]
// where `ringLen` is the coord-triple count and `ringSize` is the ring's length (LINE, unsigned) or
// signed area (POLYGON). The whole feature lives in a single Float64Array — no per-ring sub-arrays.
//
// When lineMetrics is on, LINE features always have a single ring, and `feature.start` / `feature.end`
// carry the clip metrics (in source-length units). They are absent otherwise.

export const POINT = 1;
export const LINE = 2;
export const POLYGON = 3;
export const SINGLE_POINT = 4;

/** @import {CoordArray, Feature, SinglePointFeature, FeatureId, Tags} from './internal.d.ts' */

// Z-slot sentinel marking a coord as "always kept" by simplify (exceeds any tolerance at any zoom);
// Int32 max so it survives ToInt32 on Int32Array.
export const KEEP_Z = 0x7FFFFFFF;

// Specialized 5-slot wrapper for single-Point features. No geometry array, no bbox slots (x/y are the bbox).
/** @param {FeatureId|undefined} id @param {number} x @param {number} y @param {Tags} tags @returns {SinglePointFeature} */
export function createSinglePoint(id, x, y, tags) {
    return {
        id,
        type: SINGLE_POINT,
        x,
        y,
        tags
    };
}

// LINE features with `options.lineMetrics` get a `start`/`end` pair attached later (in convert.js for
// full lines, in clip.js for per-slice features). Absent on all other feature types.
/** @param {FeatureId|undefined} id @param {1|2|3} type @param {CoordArray} geom @param {Tags} tags @returns {Feature} */
export function createFeature(id, type, geom, tags) {
    const feature = {
        id,
        type,
        geometry: geom,
        tags,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
    if (type === POINT) {
        calcBBox(feature, geom, 0, geom.length);
    } else {
        // polygon holes lie inside their outer ring — skip bbox update (ringSize < 0 after canonical winding)
        const outerOnly = type === POLYGON;
        for (let i = 0; i < geom.length;) {
            const ringLen = geom[i];
            const ringSize = geom[i + 1];
            const coords0 = i + 2;
            const coordsEnd = coords0 + ringLen * 3;
            if (!outerOnly || ringSize >= 0) calcBBox(feature, geom, coords0, coordsEnd);
            i = coordsEnd;
        }
    }
    return feature;
}

/** @param {Feature} feature @param {CoordArray} coords @param {number} start @param {number} end */
function calcBBox(feature, coords, start, end) {
    for (let i = start; i < end; i += 3) {
        const x = coords[i];
        const y = coords[i + 1];
        if (x < feature.minX) feature.minX = x;
        if (y < feature.minY) feature.minY = y;
        if (x > feature.maxX) feature.maxX = x;
        if (y > feature.maxY) feature.maxY = y;
    }
}

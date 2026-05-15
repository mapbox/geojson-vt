
// Internal feature type tags match MVT output types (and the legacy envelope's
// numeric type field). Single-vs-multi is encoded by "feature has 1+ rings".
// Polygon outer-vs-hole is encoded by winding order (canonicalized in convert)
// AND by the sign of the ring's stored `ringSize` (positive = outer, negative
// = hole) — so Polygon and MultiPolygon share one flat ring list.
export const POINT  = 1; // Point / MultiPoint:           flat [x,y,z, ...]
export const LINE   = 2; // LineString / MultiLineString: inline-header rings
export const POLYGON = 3; // Polygon / MultiPolygon:       inline-header rings
//
// Inline-header layout for LINE / POLYGON geometry:
//     [ringLen, ringSize, x,y,z, ..., ringLen, ringSize, x,y,z, ..., ...]
// where `ringLen` is the coord-triple count for the ring, and `ringSize` is
// the ring's length (LINE, unsigned) or signed area (POLYGON). The whole
// feature lives in a single Array — no per-ring sub-arrays.
//
// When lineMetrics is on, LINE features always have a single ring, and
// `feature.start` / `feature.end` carry the clip metrics (in source-length
// units). They are absent otherwise.

export default function createFeature(id, type, geom, tags) {
    const feature = {
        id: id == null ? null : id,
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
        for (let i = 0; i < geom.length;) {
            const ringLen = geom[i];
            const coords0 = i + 2;
            const coordsEnd = coords0 + ringLen * 3;
            calcBBox(feature, geom, coords0, coordsEnd);
            i = coordsEnd;
        }
    }
    return feature;
}

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

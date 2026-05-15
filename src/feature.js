
// Internal feature type tags match MVT output types (and the legacy envelope's
// numeric type field). Single-vs-multi is encoded by "feature has 1+ rings".
// Polygon outer-vs-hole is encoded by winding order (canonicalized in convert),
// not by nesting — so Polygon and MultiPolygon share one flat ring list.
export const POINT  = 1; // Point / MultiPoint:           flat [x,y,z, ...]
export const LINE   = 2; // LineString / MultiLineString: [ring, ring, ...]
export const POLYGON = 3; // Polygon / MultiPolygon:       [ring, ring, ...]
//
// `ring` is always a flat [x,y,z, ...] array with a `size` property
// (line length or polygon area; used for small-feature tolerance filtering).
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
        calcRingBBox(feature, geom);
    } else {
        for (const ring of geom) calcRingBBox(feature, ring);
    }
    return feature;
}

function calcRingBBox(feature, ring) {
    for (let i = 0; i < ring.length; i += 3) {
        const x = ring[i];
        const y = ring[i + 1];
        if (x < feature.minX) feature.minX = x;
        if (y < feature.minY) feature.minY = y;
        if (x > feature.maxX) feature.maxX = x;
        if (y > feature.maxY) feature.maxY = y;
    }
}

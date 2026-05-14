
// Marks Douglas–Peucker survival importance into the z-slot of each retained pivot, so
// downstream tile finalization can drop points whose importance falls below the per-zoom
// tolerance with a single compare. Endpoints are written separately by the caller (z = 1);
// non-pivot intermediates retain their initial z = 0 and get filtered out.
//
// Operates in place on a flat stride-3 coord buffer.

/**
 * @param {number[]} coords      stride-3 (x, y, z) flat buffer
 * @param {number} first         coord-array index of the ring's first point (multiple of 3)
 * @param {number} last          coord-array index of the ring's last point (multiple of 3)
 * @param {number} sqTolerance   squared tolerance in the same units as coords (finest zoom)
 */
export default function simplify(coords, first, last, sqTolerance) {
    let maxSqDist = sqTolerance;
    const mid = first + ((last - first) >> 1);
    let minPosToMid = last - first;
    /** @type {number | undefined} */
    let index;

    const ax = coords[first];
    const ay = coords[first + 1];
    const bx = coords[last];
    const by = coords[last + 1];

    for (let i = first + 3; i < last; i += 3) {
        const d = getSqSegDist(coords[i], coords[i + 1], ax, ay, bx, by);

        if (d > maxSqDist) {
            index = i;
            maxSqDist = d;

        } else if (d === maxSqDist) {
            // a workaround to ensure we choose a pivot close to the middle of the list,
            // reducing recursion depth, for certain degenerate inputs
            // https://github.com/mapbox/geojson-vt/issues/104
            const posToMid = Math.abs(i - mid);
            if (posToMid < minPosToMid) {
                index = i;
                minPosToMid = posToMid;
            }
        }
    }

    if (index !== undefined && maxSqDist > sqTolerance) {
        if (index - first > 3) simplify(coords, first, index, sqTolerance);
        coords[index + 2] = maxSqDist;
        if (last - index > 3) simplify(coords, index, last, sqTolerance);
    }
}

/**
 * Squared distance from point (px, py) to segment (x, y)–(bx, by).
 * @param {number} px @param {number} py
 * @param {number} x  @param {number} y
 * @param {number} bx @param {number} by
 * @returns {number}
 */
function getSqSegDist(px, py, x, y, bx, by) {

    let dx = bx - x;
    let dy = by - y;

    if (dx !== 0 || dy !== 0) {

        const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

        if (t > 1) {
            x = bx;
            y = by;

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = px - x;
    dy = py - y;

    return dx * dx + dy * dy;
}

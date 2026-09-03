
// Calculate simplification data using optimized Douglas-Peucker algorithm. Stored z-slot is sqrt(maxSqDist)
// (linear) so it fits Int32 quanta on the Int32 source-coord path, and unifies tile.js's keep-or-drop
// comparison to `> tolerance` (linear) across both paths.

import {KEEP_Z} from './feature.js';

/** @import {CoordArray} from './internal.d.ts' */

/** @param {CoordArray} coords @param {number} first @param {number} last @param {number} sqTolerance */
export default function simplify(coords, first, last, sqTolerance) {
    let maxSqDist = sqTolerance;
    const mid = first + ((last - first) >> 1);
    let minPosToMid = last - first;
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

    if (maxSqDist > sqTolerance) {
        // maxSqDist > sqTolerance implies index was assigned
        const i = /** @type {number} */ (index);
        if (i - first > 3) simplify(coords, first, i, sqTolerance);
        // clamp to KEEP_Z: at near-2^32 world spans the max perpendicular distance (~span/sqrt(2)) exceeds
        // Int32 range and would wrap negative on store, dropping a vertex that should always be kept
        coords[i + 2] = Math.min(Math.sqrt(maxSqDist), KEEP_Z);
        if (last - i > 3) simplify(coords, i, last, sqTolerance);
    }
}

// square distance from a point to a segment
/** @param {number} px @param {number} py @param {number} x @param {number} y @param {number} bx @param {number} by */
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


// calculate simplification data using optimized Douglas-Peucker algorithm

export default function simplify(coords, first, last, sqTolerance, dimensions = 2) {
    const stride = dimensions + 1;
    let maxSqDist = sqTolerance;
    const mid = (last - first) >> 1;
    let minPosToMid = last - first;
    let index;

    const ax = coords[first];
    const ay = coords[first + 1];
    const bx = coords[last];
    const by = coords[last + 1];

    for (let i = first + stride; i < last; i += stride) {
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
        if (index - first > stride) simplify(coords, first, index, sqTolerance, dimensions);
        coords[index + 2] = maxSqDist;
        if (last - index > stride) simplify(coords, index, last, sqTolerance, dimensions);
    }
}

// square distance from a point to a segment
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


// calculate simplification data using optimized Douglas-Peucker algorithm

export default function simplify(sqDist, coords, first, last, sqTolerance) {
    let maxSqDist = sqTolerance;
    const mid = (last - first) >> 1;
    let minPosToMid = last - first;
    let index;

    const ax = coords[first];
    const ay = coords[first + 1];
    const az = coords[first + 2];
    const bx = coords[last];
    const by = coords[last + 1];
    const bz = coords[last + 2];

    for (let i = first + 3; i < last; i += 3) {
        const d = getSqSegDist(coords[i], coords[i + 1], coords[i + 2], ax, ay, az, bx, by, bz);

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
        if (index - first > 3) simplify(sqDist, coords, first, index, sqTolerance);
        sqDist[index / 3] = maxSqDist;
        if (last - index > 3) simplify(sqDist, coords, index, last, sqTolerance);
    }
}

// square distance from a point to a segment
function getSqSegDist(px, py, pz, x, y, z, bx, by, bz) {

    let dx = bx - x;
    let dy = by - y;
    let dz = bz - z;

    if (dx !== 0 || dy !== 0 || dz !== 0) {

        const t = ((px - x) * dx + (py - y) * dy + (pz - z) * dz) / (dx * dx + dy * dy + dz * dz);

        if (t > 1) {
            x = bx;
            y = by;
            z = bz;

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
            z += dz * t;
        }
    }

    dx = px - x;
    dy = py - y;
    dz = pz - z;

    return dx * dx + dy * dy + dz * dz;
}

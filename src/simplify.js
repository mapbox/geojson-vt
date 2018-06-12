
// calculate simplification data using optimized Douglas-Peucker algorithm

export default function simplify(coords, sqTolerance) {
    coords[2] = 1;
    coords[coords.length - 1] = 1;

    var queue = [0, coords.length - 3];

    while (queue.length) {
        var last = queue.pop() | 0;
        var first = queue.pop() | 0;
        var maxSqDist = sqTolerance;

        var index = first;

        var ax = coords[first];
        var ay = coords[first + 1];
        var bx = coords[last];
        var by = coords[last + 1];

        for (var i = first + 3; i < last; i += 3) {
            var d = getSqSegDist(coords[i], coords[i + 1], ax, ay, bx, by);
            if (d > maxSqDist) {
                index = i | 0;
                maxSqDist = d;
            }
        }

        if (maxSqDist > sqTolerance) {
            if (index - first > 3) queue.push(first, index);
            coords[index + 2] = maxSqDist;
            if (last - index > 3) queue.push(index, last);
        }
    }
}

// square distance from a point to a segment
function getSqSegDist(px, py, x, y, bx, by) {

    var dx = bx - x;
    var dy = by - y;

    if (dx !== 0 || dy !== 0) {

        var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

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

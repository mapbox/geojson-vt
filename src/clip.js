'use strict';

module.exports = clip;

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

function clip(features, scale, k1, k2, axis, intersect) {

    k1 /= scale;
    k2 /= scale;

    var clipped = [];

    for (var i = 0; i < features.length; i++) {

        var geometry = features[i].geometry,
            type = features[i].type;

        var slices = type === 1 ?
                clipPoints(geometry, k1, k2, axis) :
                clipGeometry(geometry, k1, k2, axis, intersect, type === 3);

        if (slices.length) {
            clipped.push({
                geometry: slices,
                type: type,
                tags: features[i].tags || null
            });
        }
    }

    return clipped.length ? clipped : null;
}

function clipPoints(geometry, k1, k2, axis) {
    var slice = [];

    for (var i = 0; i < geometry.length; i++) {
        var a = geometry[i],
            ak = a[axis];

        if (ak >= k1 && ak <= k2) slice.push(a);
    }
    return slice;
}

function clipGeometry(geometry, k1, k2, axis, intersect, closed) {

    var slices = [];

    for (var i = 0; i < geometry.length; i++) {

        var ak = 0,
            bk = 0,
            b = null,
            points = geometry[i],
            len = points.length,
            a, j;

        var inside = true;

        for (j = 0; j < len; j++) {
            a = points[j];
            ak = a[axis];
            if (ak < k1 || ak > k2) {
                inside = false;
                break;
            }
        }
        if (inside) {
            slices.push(points);
            continue;
        }

        var slice = [];

        for (j = 0; j < len - 1; j++) {
            a = b || points[j];
            b = points[j + 1];
            ak = bk || a[axis];
            bk = b[axis];

            if (ak < k1) {

                if ((bk > k2)) { // ---|-----|-->
                    slice.push(intersect(a, b, k1), intersect(a, b, k2));
                    if (!closed) slice = newSlice(slices, slice);

                } else if (bk >= k1) slice.push(intersect(a, b, k1)); // ---|-->  |

            } else if (ak > k2) {

                if ((bk < k1)) { // <--|-----|---
                    slice.push(intersect(a, b, k2), intersect(a, b, k1));
                    if (!closed) slice = newSlice(slices, slice);

                } else if (bk <= k2) slice.push(intersect(a, b, k2)); // |  <--|---

            } else {

                slice.push(a);

                if (bk < k1) { // <--|---  |
                    slice.push(intersect(a, b, k1));
                    if (!closed) slice = newSlice(slices, slice);

                } else if (bk > k2) { // |  ---|-->
                    slice.push(intersect(a, b, k2));
                    if (!closed) slice = newSlice(slices, slice);
                }
                // | --> |
            }
        }

        a = points[len - 1];
        ak = a[axis];
        if (ak >= k1 && ak <= k2) slice.push(a);

        var sliceLen = slice.length;

        // close the polygon if its endpoints are not the same after clipping
        if (closed && slice[0] !== slice[sliceLen - 1]) slice.push(slice[0]);

        // add the final slice
        if (sliceLen) slices.push(slice);
    }

    return slices;
}

function newSlice(slices, slice) {
    if (slice.length) slices.push(slice);
    return [];
}

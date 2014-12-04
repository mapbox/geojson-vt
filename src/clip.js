'use strict';

module.exports = clip;

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

function clip(features, scale, k1, k2, axis, intersect) {
    var clipped = [];

    k1 /= scale;
    k2 /= scale;

    for (var i = 0; i < features.length; i++) {

        var geometry = features[i].geometry,
            type = features[i].type,
            tags = features[i].tags,
            len = geometry.length,
            slice = [],
            ak = 0, bk = 0,
            b = null,
            j, a;

        if (type === 1) {
            for (j = 0; j < len; j++) {
                a = geometry[j];
                ak = a[axis];
                if (ak >= k1 && ak <= k2) slice.push(a);
            }
            addSlice(clipped, slice, type, tags);
            continue;
        }

        for (j = 0; j < len - 1; j++) {
            a = b || geometry[j];
            b = geometry[j + 1];
            ak = bk || a[axis];
            bk = b[axis];

            if (ak < k1) {

                if ((bk > k2)) { // ---|-----|-->
                    slice.push(intersect(a, b, k1), intersect(a, b, k2));
                    slice = newSlice(clipped, slice, type, tags);

                } else if (bk >= k1) slice.push(intersect(a, b, k1)); // ---|-->  |

            } else if (ak > k2) {

                if ((bk < k1)) { // <--|-----|---
                    slice.push(intersect(a, b, k2), intersect(a, b, k1));
                    slice = newSlice(clipped, slice, type, tags);

                } else if (bk <= k2) slice.push(intersect(a, b, k2)); // |  <--|---

            } else {

                slice.push(a);

                if (bk < k1) { // <--|---  |
                    slice.push(intersect(a, b, k1));
                    slice = newSlice(clipped, slice, type, tags);

                } else if (bk > k2) { // |  ---|-->
                    slice.push(intersect(a, b, k2));
                    slice = newSlice(clipped, slice, type, tags);
                }
                // | --> |
            }
        }

        a = geometry[len - 1];
        ak = a[axis];
        if (ak >= k1 && ak <= k2) slice.push(a);

        // close the polygon if its endpoints are not the same after clipping
        if (type === 3 && slice[0] !== slice[slice.length - 1]) slice.push(slice[0]);

        // add the final slice
        addSlice(clipped, slice, type, tags);
    }

    return clipped.length ? clipped : null;
}

function newSlice(features, slice, type, tags) {
    if (type === 3) return slice; // polygon -> clipped slices should be joined
    addSlice(features, slice, type, tags);
    return [];
}

function addSlice(features, slice, type, tags) {
    if (slice.length) {
        features.push({
            geometry: slice,
            type: type,
            tags: tags
        });
    }
}

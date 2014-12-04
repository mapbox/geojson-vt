'use strict';

module.exports = clip;

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

function clip(features, k1, k2, axis, intersect) {
    var clipped = [];

    for (var i = 0; i < features.length; i++) {

        var coords = features[i].coords,
            type = features[i].type,
            props = features[i].props,
            len = coords.length,
            slice = [],
            ak = 0, bk = 0,
            b = null,
            j, a;

        if (type === 1) {
            for (j = 0; j < len; j++) {
                a = coords[j];
                ak = a[axis];
                if (ak >= k1 && ak <= k2) slice.push(a);
            }
            addSlice(clipped, slice, type, props);
            continue;
        }

        for (j = 0; j < len - 1; j++) {
            a = b || coords[j];
            b = coords[j + 1];
            ak = bk || a[axis];
            bk = b[axis];

            if (ak < k1) {

                if ((bk > k2)) { // ---|-----|-->
                    slice.push(intersect(a, b, k1), intersect(a, b, k2));
                    slice = newSlice(clipped, slice, type, props);

                } else if (bk >= k1) slice.push(intersect(a, b, k1)); // ---|-->  |

            } else if (ak > k2) {

                if ((bk < k1)) { // <--|-----|---
                    slice.push(intersect(a, b, k2), intersect(a, b, k1));
                    slice = newSlice(clipped, slice, type, props);

                } else if (bk <= k2) slice.push(intersect(a, b, k2)); // |  <--|---

            } else {

                slice.push(a);

                if (bk < k1) { // <--|---  |
                    slice.push(intersect(a, b, k1));
                    slice = newSlice(clipped, slice, type, props);

                } else if (bk > k2) { // |  ---|-->
                    slice.push(intersect(a, b, k2));
                    slice = newSlice(clipped, slice, type, props);
                }
                // | --> |
            }
        }

        a = coords[len - 1];
        ak = a[axis];
        if (ak >= k1 && ak <= k2) slice.push(a);

        // close the polygon if its endpoints are not the same after clipping
        if (type === 3 && slice[0] !== slice[slice.length - 1]) slice.push(slice[0]);

        // add the final slice
        addSlice(clipped, slice, type, props);
    }

    return clipped.length ? clipped : null;
}

function newSlice(features, slice, type, props) {
    if (type === 3) return slice; // polygon -> clipped slices should be joined
    addSlice(features, slice, type, props);
    return [];
}

function addSlice(features, slice, type, props) {
    if (slice.length) {
        features.push({
            coords: slice,
            type: type,
            props: props
        });
    }
}

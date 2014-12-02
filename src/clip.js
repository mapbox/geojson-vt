'use strict';

module.exports = clip;

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

function clip(features, k1, k2, below, above, intersect) {
    var clipped = [];

    for (var i = 0; i < features.length; i++) {
        var coords = features[i].coords,
            type = features[i].type,
            props = features[i].props,
            len = coords.length,
            slice = [],
            a, b;

        for (var j = 0; j < len - 1; j++) {
            a = coords[j];
            b = coords[j + 1];

            if (below(a, k1)) {

                // ---|-----|-->
                if (above(b, k2)) {
                    slice.push(intersect(a, b, k1));
                    slice.push(intersect(a, b, k2));
                    slice = newSlice(clipped, slice, type, props);

                // ---|-->  |
                } else if (!below(b, k1)) slice.push(intersect(a, b, k1));

            } else if (above(a, k2)) {

                // <--|-----|---
                if (below(b, k1)) {
                    slice.push(intersect(a, b, k2));
                    slice.push(intersect(a, b, k1));
                    slice = newSlice(clipped, slice, type, props);

                //    |  <--|---
                } else if (!above(b, k2)) slice.push(intersect(a, b, k2));

            } else {
                slice.push(a);

                // <--|---  |
                if (below(b, k1)) {
                    slice.push(intersect(a, b, k1));
                    slice = newSlice(clipped, slice, type, props);

                //    |  ---|-->
                } else if (above(b, k2)) {
                    slice.push(intersect(a, b, k2));
                    slice = newSlice(clipped, slice, type, props);
                }

                //    | --> |
            }
        }

        a = coords[len - 1];
        if (!above(a, k2) && !below(a, k1)) slice.push(a);

        // add the final slice
        addSlice(clipped, slice, type, props);
    }

    return clipped.length ? clipped : null;
}

// todo
// - point type
// - less above/below checks

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

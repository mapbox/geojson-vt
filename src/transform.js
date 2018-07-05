
// Transforms the coordinates of each feature in the given tile from
// mercator-projected space into (extent x extent) tile space.
export default function transformTile(tile, extent) {
    if (tile.transformed) return tile;

    var z2 = 1 << tile.z,
        tx = tile.x,
        ty = tile.y,
        i, j, k;

    var dimensions = tile.dimensions;
    for (i = 0; i < tile.features.length; i++) {
        var feature = tile.features[i],
            geom = feature.geometry,
            type = feature.type;

        feature.geometry = [];
        if (type === 1) {
            for (j = 0; j < geom.length; j += dimensions) {
                feature.geometry.push(transformPoint(geom[j], geom[j + 1], dimensions === 3 ? geom[j + 2] : null, extent, z2, tx, ty));
            }
        } else {
            for (j = 0; j < geom.length; j++) {
                var ring = [];
                for (k = 0; k < geom[j].length; k += dimensions) {
                    ring.push(transformPoint(geom[j][k], geom[j][k + 1], dimensions === 3 ? geom[j][k + 2] : null, extent, z2, tx, ty));
                }
                feature.geometry.push(ring);
            }
        }
    }

    tile.transformed = true;

    return tile;
}

function transformPoint(x, y, z, extent, z2, tx, ty) {
    if (z !== null) {
        var zPrecision = 40097932.2 / (z2 * extent);
        return [Math.round(extent * (x * z2 - tx)),
            Math.round(extent * (y * z2 - ty)),
            Math.round(z / zPrecision)];
    } else {
        return [Math.round(extent * (x * z2 - tx)),
            Math.round(extent * (y * z2 - ty))];
    }
}


// Transforms the coordinates of each feature in the given tile from
// mercator-projected space into (extent x extent) tile space.
export default function transformTile(tile, extent, options) {
    if (tile.transformed) return tile;

    const z2 = 1 << tile.z;
    const tx = tile.x;
    const ty = tile.y;

    for (const feature of tile.features) {
        const geom = feature.geometry;
        const type = feature.type;

        feature.geometry = [];

        const delta = options.cuts && type !== 1 ? 1 : 0;
        const stride = options.dimensions + delta;

        if (type === 1) {
            for (let j = 0; j < geom.length; j += stride) {
                feature.geometry.push(transformPoint(geom, j, stride, extent, z2, tx, ty));
            }
        } else if (type === 2) {
            feature.geometry = transformRings(geom, extent, z2, tx, ty, stride);
        } else {
            for (let j = 0; j < geom.length; j++) {
                feature.geometry.push(transformRings(geom[j], extent, z2, tx, ty, stride));
            }
        }
    }

    tile.transformed = true;

    return tile;
}

function transformRings(sourceRings, extent, z2, tx, ty, dimensions = 3) {
    const rings = [];
    for (let j = 0; j < sourceRings.length; j++) {
        const ring = [];
        for (let k = 0; k < sourceRings[j].length; k += dimensions) {
            ring.push(transformPoint(sourceRings[j], k, dimensions, extent, z2, tx, ty));
        }
        rings.push(ring);
    }
    return rings;
}

function transformPoint(geom, index, dimensions, extent, z2, tx, ty) {
    const result = [
        Math.round(extent * (geom[index] * z2 - tx)),
        Math.round(extent * (geom[index + 1] * z2 - ty))
    ];

    for (let i = 2; i < dimensions; i++) {
        result.push(geom[index + i]);
    }

    return result;

}

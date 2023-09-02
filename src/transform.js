
// Transforms the coordinates of each feature in the given tile from
// mercator-projected space into (extent x extent) tile space.
export default function transformTile(tile, extent) {
    if (tile.transformed) return tile;
    const z2 = 1 << tile.z;
    const tx = tile.x;
    const ty = tile.y;

    for (const feature of tile.features) {
        const geom = feature.geometry;
        const type = feature.type;

        feature.geometry = [];

        if (type === 1) {
            for (let j = 0; j < geom.length; j += 3) {
                feature.geometry.push(transformPoint(geom[j], geom[j + 1], geom[j + 2], extent, z2, tx, ty));
            }
        } else {
            for (let j = 0; j < geom.length; j++) {
                const ring = [];
                for (let k = 0; k < geom[j].length; k += 3) {
                    ring.push(transformPoint(geom[j][k], geom[j][k + 1], geom[j][k + 2], extent, z2, tx, ty));
                }
                feature.geometry.push(ring);
            }
        }
    }

    tile.transformed = true;

    return tile;
}

function transformPoint(x, y, z, extent, z2, tx, ty) {
    // FIXME: For proper quantization of the z component we would need to know the altitude range of the tile.
    return [
        Math.round(extent * (x * z2 - tx)),
        Math.round(extent * (y * z2 - ty)),
        Math.round(z)];
}

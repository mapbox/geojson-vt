import test from 'node:test';
import assert from 'node:assert/strict';
import geojsonvt from '../src/index.js';

test('updateData: requires updateable option', () => {
    const index = geojsonvt({
        type: 'FeatureCollection',
        features: []
    });

    assert.throws(() => {
        index.updateData({add: [], remove: []});
    });
});

test('updateData: adds new features', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'feature1',
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {name: 'Feature 1'}
            }
        ]
    };

    const index = geojsonvt(initialData, {updateable: true});

    const newFeature = {
        type: 'Feature',
        id: 'feature2',
        geometry: {type: 'Point', coordinates: [10, 10]},
        properties: {name: 'Feature 2'}
    };

    index.updateData({add: [newFeature]});

    const tile = index.getTile(0, 0, 0);
    assert.equal(tile.features.length, 2);
});

test('updateData: removes features by id', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'feature1',
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {name: 'Feature 1'}
            },
            {
                type: 'Feature',
                id: 'feature2',
                geometry: {type: 'Point', coordinates: [10, 10]},
                properties: {name: 'Feature 2'}
            }
        ]
    };

    const index = geojsonvt(initialData, {updateable: true});

    index.updateData({remove: ['feature1']});

    const tile = index.getTile(0, 0, 0);
    assert.equal(tile.features.length, 1);
});

test('updateData: replaces features with duplicate ids', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'feature1',
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {name: 'Original'}
            }
        ]
    };

    const index = geojsonvt(initialData, {updateable: true});

    const updatedFeature = {
        type: 'Feature',
        id: 'feature1',
        geometry: {type: 'Point', coordinates: [5, 5]},
        properties: {name: 'Updated'}
    };

    index.updateData({add: [updatedFeature]});

    const tile = index.getTile(0, 0, 0);
    assert.equal(tile.features.length, 1);
    assert.equal(tile.features[0].id, 'feature1');
    assert.equal(tile.features[0].tags.name, 'Updated');
});

test('updateData: handles both add and remove in same call', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'feature1',
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {name: 'Feature 1'}
            },
            {
                type: 'Feature',
                id: 'feature2',
                geometry: {type: 'Point', coordinates: [10, 10]},
                properties: {name: 'Feature 2'}
            }
        ]
    };

    const index = geojsonvt(initialData, {updateable: true});

    const newFeature = {
        type: 'Feature',
        id: 'feature3',
        geometry: {type: 'Point', coordinates: [20, 20]},
        properties: {name: 'Feature 3'}
    };

    index.updateData({
        remove: ['feature1'],
        add: [newFeature]
    });

    const tile = index.getTile(0, 0, 0);
    assert.equal(tile.features.length, 2);

    const featureIds = tile.features.map(f => f.id).sort();
    assert.deepEqual(featureIds, ['feature2', 'feature3']);
});

test('updateData: works with empty diff', () => {
    const index = geojsonvt({
        type: 'FeatureCollection',
        features: []
    }, {updateable: true});

    assert.doesNotThrow(() => {
        index.updateData({});
        index.updateData({add: [], remove: []});
    });
});

test('updateData: invalidates tiles at deeper zoom', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            id: 'feature1',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [0, 0], [5, 0], [5, 5], [0, 5], [0, 0]
                ]]
            },
            properties: {name: 'Original'}
        }]
    };

    const index = geojsonvt(initialData, {
        updateable: true,
        indexMaxZoom: 5,
        indexMaxPoints: 0
    });

    const tileId = toID(5, 16, 16);

    const tileBefore = index.tiles[tileId];
    assert.ok(tileBefore);
    assert.equal(tileBefore.numFeatures, 1);

    const updatedFeature = {
        type: 'Feature',
        id: 'feature1',
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [0, 0], [10, 0], [10, 10], [0, 10], [0, 0]
            ]]
        },
        properties: {name: 'Updated'}
    };

    index.updateData({add: [updatedFeature]});

    const tileAfter = index.tiles[tileId];
    assert.equal(tileAfter, undefined);

    const tileRegenerated = index.getTile(5, 16, 16);
    assert.ok(tileRegenerated);
    assert.equal(tileRegenerated.features[0].tags.name, 'Updated');
});

test('updateData: invalidates tiles with partial intersection', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'far-east',
                geometry: {
                    type: 'Point',
                    coordinates: [179.99, 0]  // far east
                }
            }
        ]
    };

    const index = geojsonvt(initialData, {
        updateable: true,
        indexMaxZoom: 2,
        indexMaxPoints: 0
    });

    const edgeFeature = {
        type: 'Feature',
        id: 'edge-line',
        geometry: {
            type: 'LineString',
            coordinates: [[0, -1], [180, 1]]
        }
    };

    index.updateData({add: [edgeFeature]});

    const tile = index.getTile(2, 3, 2);
    assert.ok(tile);
    assert.equal(tile.features.length, 2);
});

test('updateData: invalidates empty tiles', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'nw-only',
                geometry: {
                    type: 'Point',
                    coordinates: [-90, 45]  // top left quadrant only
                }
            }
        ]
    };

    const index = geojsonvt(initialData, {
        updateable: true,
        indexMaxZoom: 1,
        indexMaxPoints: 0,
        debug: 1
    });
    assert.equal(index.stats.z1, 4);

    const globalFeature = {
        type: 'Feature',
        id: 'global',
        geometry: {
            type: 'LineString',
            coordinates: [[-180, -85], [180, 85]]  // spans whole world
        }
    };

    index.updateData({add: [globalFeature]});
    assert.equal(index.stats.z1, 0);
});

test('updateData: does not invalidate unaffected tiles', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'northwest',
                geometry: {
                    type: 'Point',
                    coordinates: [-90, 45]  // NW quadrant only
                }
            },
            {
                type: 'Feature',
                id: 'southeast',
                geometry: {
                    type: 'Point',
                    coordinates: [90, -45]  // SE quadrant only
                }
            }
        ]
    };

    const index = geojsonvt(initialData, {
        updateable: true,
        indexMaxZoom: 2,
        indexMaxPoints: 0
    });

    const nwTileId = toID(1, 0, 0);
    const seTileId = toID(1, 1, 1);

    const nwTileBefore = index.tiles[nwTileId];
    const seTileBefore = index.tiles[seTileId];

    assert.ok(nwTileBefore);
    assert.ok(seTileBefore);

    const updatedFeature = {
        type: 'Feature',
        id: 'northwest',
        geometry: {
            type: 'Point',
            coordinates: [-85, 40]  // NW different coordinate
        }
    };

    index.updateData({add: [updatedFeature]});

    const nwTileAfter = index.tiles[nwTileId];
    assert.equal(nwTileAfter, undefined);

    const seTileAfter = index.tiles[seTileId];
    assert.equal(seTileAfter, seTileBefore);
});

test('updateData: invalidates and regenerates tiles at multiple zoom levels', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'feature1',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [0, 0],
                        [5, 0],
                        [5, 5],
                        [0, 5],
                        [0, 0]
                    ]]
                },
                properties: {name: 'Original'}
            }
        ]
    };

    const index = geojsonvt(initialData, {
        updateable: true,
        indexMaxZoom: 7,
        indexMaxPoints: 0
    });

    const updatedFeature = {
        type: 'Feature',
        id: 'feature1',
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0]
            ]]
        },
        properties: {name: 'Updated'}
    };

    index.updateData({add: [updatedFeature]});

    const newZ3Tile = index.getTile(3, 4, 4);
    const newZ5Tile = index.getTile(5, 16, 16);
    const newZ7Tile = index.getTile(7, 64, 64);

    assert.ok(newZ3Tile);
    assert.ok(newZ5Tile);
    assert.ok(newZ7Tile);

    assert.equal(newZ3Tile.features[0].id, 'feature1');
    assert.equal(newZ3Tile.features[0].tags.name, 'Updated');

    assert.equal(newZ5Tile.features[0].id, 'feature1');
    assert.equal(newZ5Tile.features[0].tags.name, 'Updated');

    assert.equal(newZ7Tile.features[0].id, 'feature1');
    assert.equal(newZ7Tile.features[0].tags.name, 'Updated');
});

test('updateData: invalidates tiles when feature is within the buffer edge', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            id: 'feature1',
            geometry: {
                type: 'Point',
                coordinates: [-45, 45] // inside tile 1-0-0
            }
        }]
    };

    const index = geojsonvt(initialData, {
        updateable: true,
        indexMaxZoom: 1,
        indexMaxPoints: 0
    });

    const tileId = toID(1, 0, 0);
    index.getTile(1, 0, 0);
    assert.ok(index.tiles[tileId]);

    const featureWithinBuffer = {
        type: 'Feature',
        id: 'buffer-feature',
        geometry: {
            type: 'Point',
            coordinates: [2, 0] // feature within tile buffer edge
        }
    };

    index.updateData({add: [featureWithinBuffer]});
    assert.equal(index.tiles[tileId], undefined);
});

test('updateData: handles drill-down after update', () => {
    const initialData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                id: 'line1',
                geometry: {
                    type: 'LineString',
                    coordinates: [[0, 0], [5, 5]]
                }
            }
        ]
    };

    const index = geojsonvt(initialData, {
        updateable: true,
        indexMaxZoom: 5
    });

    const newFeature = {
        type: 'Feature',
        id: 'line2',
        geometry: {
            type: 'LineString',
            coordinates: [[0, 0], [6, 6]]
        }
    };

    index.updateData({add: [newFeature]});

    const highZoomTile = index.getTile(8, 128, 128);
    assert.ok(highZoomTile);

    const featureIds = highZoomTile.features.map(f => f.id).sort();
    assert.deepEqual(featureIds, ['line1', 'line2']);
});

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

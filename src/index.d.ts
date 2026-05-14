// Public types for geojson-vt

import type {GeoJSON} from 'geojson';
import type {Properties} from './featureset.js';

export interface Options {
    maxZoom: number;
    indexMaxZoom: number;
    indexMaxPoints: number;
    tolerance: number;
    extent: number;
    buffer: number;
    lineMetrics: boolean;
    promoteId: string | null;
    generateId: boolean;
    debug: 0 | 1 | 2;
}

export interface TileCoord {
    z: number;
    x: number;
    y: number;
}

// Flat shape returned by getTileRaw(). Zero-copy: typed arrays reference internal storage — treat as
// immutable. For feature i ∈ [0, sourceIndices.length):
//   type       = sourceTypes[sourceIndices[i]]
//   id         = sourceIds[sourceIndices[i]]            (NaN === absent)
//   properties = sourceProperties[sourceIndices[i]]
//   rings      = [ringOffsets[i] .. ringOffsets[i+1])
// lineMetrics consumers derive the four mapbox_clip_* values from ringSizes + ringClips + extent * z2.
export interface RawTile {
    coords: Int16Array | Int32Array;
    rings: Uint32Array;
    ringOffsets: Uint32Array;
    sourceIndices: Uint32Array;
    ringSizes?: Float32Array;
    ringClips?: Float32Array;
    sourceIds: Float64Array;
    sourceTypes: Uint8Array;
    sourceProperties: Properties[];
}

export default class GeoJSONVT {
    constructor(data: GeoJSON, options?: Partial<Options>);
    options: Options;
    tileCoords: TileCoord[];
    getTile(z: number, x: number, y: number): LegacyTile | null;
    getTileRaw(z: number, x: number, y: number): RawTile | null;
}

// Legacy nested shape returned by getTile(). `tags` (not `properties`) matches Supercluster
// and gl-js's geojson_rt.ts for cross-library envelope consistency. New code: prefer getTileRaw().
export interface LegacyTile {
    features: LegacyFeature[];
}
export type LegacyFeature = {
    id?: number;
    tags: Properties
} & ({
    type: 1;
    geometry: [number, number][]
} | {
    type: 2 | 3;
    geometry: [number, number][][]
});

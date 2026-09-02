// Public types for geojson-vt

import type {GeoJSON} from 'geojson';

// Constructor input: every field is optional and falls back to its default. The resolved set of
// options, with defaults filled in, is what `GeoJSONVT.options` exposes.
export interface Options {
    maxZoom?: number;
    indexMaxZoom?: number;
    indexMaxPoints?: number;
    tolerance?: number;
    extent?: number;
    buffer?: number;
    lineMetrics?: boolean;
    promoteId?: string | null;
    generateId?: boolean;
    debug?: 0 | 1 | 2;
}

export interface TileCoord { z: number; x: number; y: number; }

// Legacy nested envelope returned by getTile(). Coords are extent-scaled ints
// in tile space. `tags` (not `properties`) matches Supercluster and gl-js's
// geojson_rt.ts for cross-library envelope consistency.
export type LegacyFeature = {
    id?: number | string;
    tags: Record<string, unknown> | null;
} & ({
    type: 1;
    geometry: [number, number][];
} | {
    type: 2 | 3;
    geometry: [number, number][][];
});

export interface LegacyTile {
    features: LegacyFeature[];
}

export default class GeoJSONVT {
    constructor(data: GeoJSON, options?: Options);
    options: Readonly<Required<Options>>;
    tileCoords: TileCoord[];
    getTile(z: number | string, x: number | string, y: number | string): LegacyTile | null;
}

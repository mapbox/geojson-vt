import type {GeoJSON} from 'geojson';

export interface Options {
    /** max zoom to preserve detail on; 0..24 */
    maxZoom?: number;
    /** max zoom in the initial tile index */
    indexMaxZoom?: number;
    /** max number of points per tile in the index */
    indexMaxPoints?: number;
    /** simplification tolerance (higher means simpler) */
    tolerance?: number;
    /** tile extent (both width and height) */
    extent?: number;
    /** tile buffer on each side */
    buffer?: number;
    /** whether to enable line metrics tracking for LineString/MultiLineString features */
    lineMetrics?: boolean;
    /** name of a feature property to promote to feature.id; mutually exclusive with `generateId` */
    promoteId?: string | null;
    /** whether to generate feature ids; mutually exclusive with `promoteId` */
    generateId?: boolean;
    /** logging level (0, 1 or 2) */
    debug?: 0 | 1 | 2;
}

/** Numeric feature type, matching the JSON form of the Mapbox Vector Tile spec. */
export type FeatureType = 1 | 2 | 3; // 1 = Point/MultiPoint, 2 = LineString/MultiLineString, 3 = Polygon/MultiPolygon

/** A feature in the legacy nested envelope returned by `getTile()`. */
export interface TileFeature {
    /** For type 1: array of [x, y] pairs. For type 2/3: array of rings, each an array of [x, y] pairs. */
    geometry: number[][] | number[][][];
    type: FeatureType;
    tags: Record<string, unknown> | null;
    id?: string | number;
}

/**
 * Legacy nested envelope returned by `getTile(z, x, y)`. Coordinates are
 * extent-scaled integers in tile space.
 */
export interface Tile {
    features: TileFeature[];
    numPoints: number;
    numSimplified: number;
    numFeatures: number;
    source: unknown[] | null;
    x: number;
    y: number;
    z: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export class GeoJSONVT {
    constructor(data: GeoJSON, options?: Options);

    options: Required<Options>;
    /** Index of retained internal tiles, keyed by an integer id derived from (z, x, y). */
    tiles: Record<number, unknown>;
    tileCoords: Array<{z: number; x: number; y: number}>;

    /** Populated only when `debug` is enabled. */
    stats?: Record<string, number>;
    /** Populated only when `debug` is enabled. */
    total?: number;

    /**
     * Returns the legacy nested envelope for the tile at (z, x, y), or null if
     * no such tile exists and cannot be drilled down to. Coordinates are
     * already extent-scaled integers in tile space.
     */
    getTile(z: number | string, x: number | string, y: number | string): Tile | null;

    /** Internal: splits features from a parent tile into sub-tiles. */
    splitTile(
        features: unknown[],
        z: number,
        x: number,
        y: number,
        cz?: number,
        cx?: number,
        cy?: number
    ): void;
}

declare function geojsonvt(data: GeoJSON, options?: Options): GeoJSONVT;
export default geojsonvt;

import { GeoJSON } from 'geojson';

export type TagValue = string | number | boolean | null;

export const enum GeoJsonFeatureType {
    Points = 1,
    Lines = 2,
    Polygons = 3,
}

export interface TileFeatureBase {
    tags: { [key: string]: TagValue };
    index: number;
    id?: number | string;
}

export interface TileFeaturePoints extends TileFeatureBase {
    geometry: GeoJSON.Position[];
    type: GeoJsonFeatureType.Points;
}

export interface TileFeatureLines extends TileFeatureBase {
    geometry: GeoJSON.Position[][];
    type: GeoJsonFeatureType.Lines;
}

export interface TileFeaturePolygons extends TileFeatureBase {
    geometry: GeoJSON.Position[][][];
    type: GeoJsonFeatureType.Polygons;
}

export type TileFeature = TileFeaturePoints | TileFeatureLines | TileFeaturePolygons;

export interface GeoJsonVtOptions {
    /**
     * max zoom to preserve detail on; can't be higher than 24
     */
    maxZoom?: number;

    /**
     * max zoom in the initial tile index
     */
    indexMaxZoom?: number;

    /**
     * 100000 max number of points per tile in the index
     */
    indexMaxPoints?: number;

    /**
     * tolerance: 3, simplification tolerance (higher means simpler)
     */
    tolerance?: number;

    /**
     * tile extent (both width and height)
     */
    extent?: number;

    /**
     * tile buffer on each side
     */
    buffer?: number;

    /**
     * whether to enable line metrics tracking for LineString/MultiLineString features
     */
    lineMetrics?: boolean;

    /**
     * name of a feature property to promote to feature.id. Cannot be used with `generateId`
     */
    promoteId?: string | null;

    /**
     * whether to generate feature ids. Cannot be used with `promoteId`
     */
    generateId?: boolean;

    /**
     * whether to generate feature indexes
     */
    generateIndex?: boolean;

    /**
     * logging level (0 to disable, 1 or 2)
     */
    debug?: number;

    /**
     * number of coordinates per vertex in the input array (2 by default)
     */
    dimensions?: number;

    /**
     * whether to generate cuts in last component of polygon and line points (false by default)
     */
    cuts?: boolean;
}

export interface TileGeoJsonVt {
    features: TileFeature[];
    numPoints: number;
    numSimplified: number;
    numFeatures: number;
    source: GeoJSON;
    x: number;
    y: number;
    z: number;
    transformed: boolean;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface GeoJsonVT {
    getTile(z: number, x: number, y: number): TileGeoJsonVt | null;
}

export default function geojsonvt(data: GeoJSON, options: GeoJsonVtOptions): GeoJsonVT;

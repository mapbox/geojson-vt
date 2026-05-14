
import simplify from './simplify.js';

/** @typedef {import('./featureset.js').FeatureSet} FeatureSet */
/** @typedef {import('./featureset.js').SourceData} SourceData */
/** @typedef {import('./featureset.js').Properties} Properties */
/** @typedef {import('./index.js').Options} Options */
/** @typedef {import('geojson').GeoJSON} GeoJSON */
/** @typedef {import('geojson').Geometry} Geometry */
/** @typedef {import('geojson').Feature} Feature */

// Reads input GeoJSON, emits the initial pipeline FeatureSet, and allocates the index-global
// SourceData. Projects coords to mercator [0, 1], fuses per-feature bbox into the projection
// loop, enforces canonical polygon winding (outer = positive area), and explodes
// MultiLineString into per-line features under lineMetrics — all sharing the source row.
class Converter {
    /** @param {Options} options */
    constructor(options) {
        this.sqTolerance = (options.tolerance / ((1 << options.maxZoom) * options.extent)) ** 2;
        this.lineMetrics = !!options.lineMetrics;
        this.promoteId = options.promoteId;
        this.generateId = !!options.generateId;

        /** @type {FeatureSet} */
        this.set = {
            coords: [], rings: [], ringOffsets: [], sourceIndices: [], bboxes: [],
            bounds: [Infinity, Infinity, -Infinity, -Infinity],
            numFeatures: 0
        };
        /** @type {number[] | null} */ this.ringSizes = null;                            // lazy; omitted for pure-point sets
        /** @type {number[] | null} */ this.ringClips = this.lineMetrics ? [] : null;    // only under lineMetrics

        /** @type {number[]} */     this.sourceTypes = [];
        /** @type {number[]} */     this.sourceIds = [];
        /** @type {Properties[]} */ this.sourceProperties = [];

        // per-feature bbox scratch — reset by startFeature, drained by finishFeature
        this.fMinX = 0; this.fMinY = 0; this.fMaxX = 0; this.fMaxY = 0;
    }

    /**
     * @param {GeoJSON} data
     * @returns {{set: FeatureSet, source: SourceData}}
     */
    run(data) {
        if (data.type === 'FeatureCollection') {
            for (let i = 0; i < data.features.length; i++) this.convertFeature(data.features[i], i);
        } else if (data.type === 'Feature') {
            this.convertFeature(data, 0);
        } else {
            this.convertGeometry(data, NaN, null);  // bare Geometry / GeometryCollection
        }

        const set = this.set;
        set.rings.push(set.coords.length / 3);         // trailing point-count sentinel
        set.ringOffsets.push(set.rings.length - 1);    // trailing ring-count sentinel
        if (this.ringSizes !== null) set.ringSizes = this.ringSizes;
        if (this.ringClips !== null) set.ringClips = this.ringClips;

        return {
            set,
            source: {
                types: Uint8Array.from(this.sourceTypes),
                ids: Float64Array.from(this.sourceIds),
                properties: this.sourceProperties
            }
        };
    }

    /** @param {Feature} geojson @param {number} index */
    convertFeature(geojson, index) {
        if (!geojson.geometry) return;
        let id = geojson.id;
        if (this.promoteId != null) id = geojson.properties && geojson.properties[this.promoteId];
        else if (this.generateId) id = index || 0;
        // non-numeric ids coerce to NaN (= absent); see plan §4.3. parseFloat does ToString
        // internally, so the cast is purely for tsc — runtime accepts number/undefined too.
        this.convertGeometry(geojson.geometry, parseFloat(/** @type {string} */ (id)), geojson.properties || null);
    }

    /** @param {Geometry} geom @param {number} id @param {Properties} props */
    convertGeometry(geom, id, props) {
        if (geom.type === 'GeometryCollection') {
            for (const sub of geom.geometries) this.convertGeometry(sub, id, props);
            return;
        }

        // Type validity is checked before the empty-coords early return — otherwise
        // `{type:'Pologon'}` with no coords would silently pass.
        let type;
        switch (geom.type) {
            case 'Point': case 'MultiPoint':           type = 1; break;
            case 'LineString': case 'MultiLineString': type = 2; break;
            case 'Polygon': case 'MultiPolygon':       type = 3; break;
            default: throw new Error('Input data is not a valid GeoJSON object.');
        }

        const coords = geom.coordinates;
        if (!coords || coords.length === 0) return;

        const src = this.addSource(type, id, props);

        // The casts below recover from GeoJSON's union-typed `coordinates` — type-tag
        // narrowing across the outer dispatch isn't visible to tsc on the shared `coords` local.
        if (type === 1) {
            // single feature, single ring of N points
            const points = /** @type {number[][]} */ (geom.type === 'Point' ? [coords] : coords);
            this.startFeature(src);
            this.writePoints(points);
            this.finishFeature();

        } else if (type === 2) {
            const lines = /** @type {number[][][]} */ (geom.type === 'LineString' ? [coords] : coords);
            if (this.lineMetrics) {
                // explode: one feature per line, all sharing the source row
                for (const line of lines) {
                    this.startFeature(src);
                    this.writeLineRing(line, false);
                    this.finishFeature();
                }
            } else {
                this.startFeature(src);
                for (const line of lines) this.writeLineRing(line, false);
                this.finishFeature();
            }

        } else {
            // single feature; rings of all polygons in this geometry concatenated (winding-corrected per group)
            const polygons = /** @type {number[][][][]} */ (geom.type === 'Polygon' ? [coords] : coords);
            this.startFeature(src);
            for (const polygon of polygons) this.writePolygonRings(polygon);
            this.finishFeature();
        }
    }

    /**
     * @param {number} type 1=point, 2=line, 3=polygon
     * @param {number} id
     * @param {Properties} props
     * @returns {number} source-row index
     */
    addSource(type, id, props) {
        const idx = this.sourceTypes.length;
        this.sourceTypes.push(type);
        this.sourceIds.push(id);
        this.sourceProperties.push(props);
        return idx;
    }

    /** @param {number} sourceIndex */
    startFeature(sourceIndex) {
        this.set.ringOffsets.push(this.set.rings.length);
        this.set.sourceIndices.push(sourceIndex);
        this.fMinX = Infinity; this.fMinY = Infinity;
        this.fMaxX = -Infinity; this.fMaxY = -Infinity;
    }

    finishFeature() {
        const set = this.set;
        set.bboxes.push(this.fMinX, this.fMinY, this.fMaxX, this.fMaxY);
        if (this.fMinX < set.bounds[0]) set.bounds[0] = this.fMinX;
        if (this.fMinY < set.bounds[1]) set.bounds[1] = this.fMinY;
        if (this.fMaxX > set.bounds[2]) set.bounds[2] = this.fMaxX;
        if (this.fMaxY > set.bounds[3]) set.bounds[3] = this.fMaxY;
        set.numFeatures++;
    }

    /** @param {number} x @param {number} y */
    updateBBox(x, y) {
        if (x < this.fMinX) this.fMinX = x;
        if (y < this.fMinY) this.fMinY = y;
        if (x > this.fMaxX) this.fMaxX = x;
        if (y > this.fMaxY) this.fMaxY = y;
    }

    /**
     * Writes one ring containing all given points (Point: [coords]; MultiPoint: coords).
     * @param {number[][]} points
     */
    writePoints(points) {
        const set = this.set;
        set.rings.push(set.coords.length / 3);
        for (const p of points) {
            const x = projectX(p[0]);
            const y = projectY(p[1]);
            set.coords.push(x, y, 0);
            this.updateBBox(x, y);
        }
        if (this.ringSizes !== null) this.ringSizes.push(0);
        if (this.ringClips !== null) this.ringClips.push(0, 0);
    }

    /**
     * Projects, simplifies, and writes one line or polygon ring.
     * Returns *signed* size (area for polygon, length for line); writePolygonRings reads
     * the sign for winding correction. ringSizes stores |size|.
     * @param {number[][]} line
     * @param {boolean} isPolygon
     * @returns {number}
     */
    writeLineRing(line, isPolygon) {
        this.ensureRingSizes();
        const set = this.set;
        const ringStart = set.coords.length;
        set.rings.push(ringStart / 3);

        let x0 = 0, y0 = 0;
        let size = 0;
        for (let j = 0; j < line.length; j++) {
            const x = projectX(line[j][0]);
            const y = projectY(line[j][1]);
            set.coords.push(x, y, 0);
            this.updateBBox(x, y);
            if (j > 0) {
                if (isPolygon) size += (x0 * y - x * y0) / 2;
                else size += Math.hypot(x - x0, y - y0);
            }
            x0 = x; y0 = y;
        }

        const lastIdx = set.coords.length - 3;
        if (lastIdx > ringStart) {
            set.coords[ringStart + 2] = 1;
            simplify(set.coords, ringStart, lastIdx, this.sqTolerance);
            set.coords[lastIdx + 2] = 1;
        }

        /** @type {number[]} */ (this.ringSizes).push(isPolygon ? Math.abs(size) : size);
        if (this.ringClips !== null) this.ringClips.push(0, isPolygon ? 0 : size);
        return size;
    }

    /**
     * Canonical winding: outer ring (r === 0) positive area, holes negative.
     * @param {number[][][]} rings
     */
    writePolygonRings(rings) {
        for (let r = 0; r < rings.length; r++) {
            const signed = this.writeLineRing(rings[r], true);
            if ((r === 0) === (signed < 0)) this.reverseLastRing();
        }
    }

    // Reverses the most recently written ring in-place against the flat coord buffer.
    reverseLastRing() {
        const set = this.set;
        let i = set.rings[set.rings.length - 1] * 3;
        let j = set.coords.length - 3;
        while (i < j) {
            const tx = set.coords[i], ty = set.coords[i + 1], tz = set.coords[i + 2];
            set.coords[i]     = set.coords[j];
            set.coords[i + 1] = set.coords[j + 1];
            set.coords[i + 2] = set.coords[j + 2];
            set.coords[j]     = tx;
            set.coords[j + 1] = ty;
            set.coords[j + 2] = tz;
            i += 3; j -= 3;
        }
    }

    // Backfills zero entries for any point rings already written, so ring indexing
    // stays aligned regardless of when the first line/polygon ring shows up.
    ensureRingSizes() {
        if (this.ringSizes === null) this.ringSizes = new Array(this.set.rings.length).fill(0);
    }
}

/** @param {number} x */
function projectX(x) {
    return x / 360 + 0.5;
}

/** @param {number} y */
function projectY(y) {
    const sin = Math.sin(y * Math.PI / 180);
    const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}

export default Converter;

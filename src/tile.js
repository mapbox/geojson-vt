
export default function createTile(dimensions, features, z, tx, ty, options) {
    var tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
    var tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: 0,
        source: null,
        dimensions: dimensions,
        x: tx,
        y: ty,
        z: z,
        transformed: false,
        minX: 2,
        minY: 1,
        maxX: -1,
        maxY: 0
    };
    for (var i = 0; i < features.length; i++) {
        tile.numFeatures++;
        addFeature(tile, features[i], tolerance, options);

        var minX = features[i].minX;
        var minY = features[i].minY;
        var maxX = features[i].maxX;
        var maxY = features[i].maxY;
        // if (dimensions === 3) maxZ = features[i].maxZ;

        if (minX < tile.minX) tile.minX = minX;
        if (minY < tile.minY) tile.minY = minY;
        if (maxX > tile.maxX) tile.maxX = maxX;
        if (maxY > tile.maxY) tile.maxY = maxY;
        // if (dimensions === 3) if (maxZ > tile.maxZ) tile.maxZ = maxZ;
    }
    return tile;
}

function addFeature(tile, feature, tolerance, options) {

    var geom = feature.geometry,
        type = feature.type,
        simplified = [],
        stride = tile.dimensions + 1;

    if (type === 'Point' || type === 'MultiPoint') {
        for (var i = 0; i < geom.length; i += stride) {
            simplified.push(geom[i]);
            simplified.push(geom[i + 1]);
            if (tile.dimensions === 3) simplified.push(geom[i + 2]);
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        addLine(tile.dimensions, simplified, geom, tile, tolerance, false, false);

    } else if (type === 'MultiLineString' || type === 'Polygon') {
        for (i = 0; i < geom.length; i++) {
            addLine(tile.dimensions, simplified, geom[i], tile, tolerance, type === 'Polygon', i === 0);
        }

    } else if (type === 'MultiPolygon') {

        for (var k = 0; k < geom.length; k++) {
            var polygon = geom[k];
            for (i = 0; i < polygon.length; i++) {
                addLine(tile.dimensions, simplified, polygon[i], tile, tolerance, true, i === 0);
            }
        }
    }

    if (simplified.length) {
        var tags = feature.tags || null;
        if (type === 'LineString' && options.lineMetrics) {
            tags = {};
            for (var key in feature.tags) tags[key] = feature.tags[key];
            tags['mapbox_clip_start'] = geom.start / geom.size;
            tags['mapbox_clip_end'] = geom.end / geom.size;
        }
        var tileFeature = {
            geometry: simplified,
            type: type === 'Polygon' || type === 'MultiPolygon' ? 3 :
                type === 'LineString' || type === 'MultiLineString' ? 2 : 1,
            tags: tags
        };
        if (feature.id !== null) {
            tileFeature.id = feature.id;
        }
        tile.features.push(tileFeature);
    }
}

function addLine(dimensions, result, geom, tile, tolerance, isPolygon, isOuter) {
    var sqTolerance = tolerance * tolerance;
    var stride = dimensions + 1;
    if (tolerance > 0 && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += geom.length / stride;
        return;
    }

    var ring = [];

    for (var i = 0; i < geom.length; i += stride) {
        if (tolerance === 0 || geom[i + stride - 1] > sqTolerance) {
            tile.numSimplified++;
            ring.push(geom[i]);
            ring.push(geom[i + 1]);
            if (dimensions === 3) ring.push(geom[i + 2]);
        }
        tile.numPoints++;
    }

    // polygons do not support 3 dimensions
    if (isPolygon) rewind(ring, isOuter);

    result.push(ring);
}

function rewind(ring, clockwise) {
    var area = 0;
    for (var i = 0, len = ring.length, j = len - 2; i < len; j = i, i += 2) {
        area += (ring[i] - ring[j]) * (ring[i + 1] + ring[j + 1]);
    }
    if (area > 0 === clockwise) {
        for (i = 0, len = ring.length; i < len / 2; i += 2) {
            var x = ring[i];
            var y = ring[i + 1];
            ring[i] = ring[len - 2 - i];
            ring[i + 1] = ring[len - 1 - i];
            ring[len - 2 - i] = x;
            ring[len - 1 - i] = y;
        }
    }
}

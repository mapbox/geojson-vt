(function (global, factory) {
typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
typeof define === 'function' && define.amd ? define(factory) :
(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.geojsonvt = factory());
})(this, (function () { 'use strict';

// calculate simplification data using optimized Douglas-Peucker algorithm

function simplify(coords, first, last, sqTolerance) {
    var maxSqDist = sqTolerance;
    var mid = (last - first) >> 1;
    var minPosToMid = last - first;
    var index;

    var ax = coords[first];
    var ay = coords[first + 1];
    var bx = coords[last];
    var by = coords[last + 1];

    for (var i = first + 3; i < last; i += 3) {
        var d = getSqSegDist(coords[i], coords[i + 1], ax, ay, bx, by);

        if (d > maxSqDist) {
            index = i;
            maxSqDist = d;

        } else if (d === maxSqDist) {
            // a workaround to ensure we choose a pivot close to the middle of the list,
            // reducing recursion depth, for certain degenerate inputs
            // https://github.com/mapbox/geojson-vt/issues/104
            var posToMid = Math.abs(i - mid);
            if (posToMid < minPosToMid) {
                index = i;
                minPosToMid = posToMid;
            }
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 3) { simplify(coords, first, index, sqTolerance); }
        coords[index + 2] = maxSqDist;
        if (last - index > 3) { simplify(coords, index, last, sqTolerance); }
    }
}

// square distance from a point to a segment
function getSqSegDist(px, py, x, y, bx, by) {

    var dx = bx - x;
    var dy = by - y;

    if (dx !== 0 || dy !== 0) {

        var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);

        if (t > 1) {
            x = bx;
            y = by;

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = px - x;
    dy = py - y;

    return dx * dx + dy * dy;
}

function createFeature(id, type, geom, tags) {
    var feature = {
        id: id == null ? null : id,
        type: type,
        geometry: geom,
        tags: tags,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };

    if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
        calcLineBBox(feature, geom);

    } else if (type === 'Polygon') {
        // the outer ring (ie [0]) contains all inner rings
        calcLineBBox(feature, geom[0]);

    } else if (type === 'MultiLineString') {
        for (var i = 0, list = geom; i < list.length; i += 1) {
            var line = list[i];

            calcLineBBox(feature, line);
        }

    } else if (type === 'MultiPolygon') {
        for (var i$1 = 0, list$1 = geom; i$1 < list$1.length; i$1 += 1) {
            // the outer ring (ie [0]) contains all inner rings
            var polygon = list$1[i$1];

            calcLineBBox(feature, polygon[0]);
        }
    }

    return feature;
}

function calcLineBBox(feature, geom) {
    for (var i = 0; i < geom.length; i += 3) {
        feature.minX = Math.min(feature.minX, geom[i]);
        feature.minY = Math.min(feature.minY, geom[i + 1]);
        feature.maxX = Math.max(feature.maxX, geom[i]);
        feature.maxY = Math.max(feature.maxY, geom[i + 1]);
    }
}

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

function convert(data, options) {
    var features = [];
    if (data.type === 'FeatureCollection') {
        for (var i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], options, i);
        }

    } else if (data.type === 'Feature') {
        convertFeature(features, data, options);

    } else {
        // single geometry or a geometry collection
        convertFeature(features, {geometry: data}, options);
    }

    return features;
}

function convertFeature(features, geojson, options, index) {
    if (!geojson.geometry) { return; }

    var coords = geojson.geometry.coordinates;
    var type = geojson.geometry.type;
    var tolerance = Math.pow(options.tolerance / ((1 << options.maxZoom) * options.extent), 2);
    var geometry = [];
    var id = geojson.id;
    if (options.promoteId) {
        id = geojson.properties[options.promoteId];
    } else if (options.generateId) {
        id = index || 0;
    }
    if (type === 'Point') {
        convertPoint(coords, geometry);

    } else if (type === 'MultiPoint') {
        for (var i = 0, list = coords; i < list.length; i += 1) {
            var p = list[i];

            convertPoint(p, geometry);
        }

    } else if (type === 'LineString') {
        convertLine(coords, geometry, tolerance, false);

    } else if (type === 'MultiLineString') {
        if (options.lineMetrics) {
            // explode into linestrings to be able to track metrics
            for (var i$1 = 0, list$1 = coords; i$1 < list$1.length; i$1 += 1) {
                var line = list$1[i$1];

                geometry = [];
                convertLine(line, geometry, tolerance, false);
                features.push(createFeature(id, 'LineString', geometry, geojson.properties));
            }
            return;
        } else {
            convertLines(coords, geometry, tolerance, false);
        }

    } else if (type === 'Polygon') {
        convertLines(coords, geometry, tolerance, true);

    } else if (type === 'MultiPolygon') {
        for (var i$2 = 0, list$2 = coords; i$2 < list$2.length; i$2 += 1) {
            var polygon = list$2[i$2];

            var newPolygon = [];
            convertLines(polygon, newPolygon, tolerance, true);
            geometry.push(newPolygon);
        }
    } else if (type === 'GeometryCollection') {
        for (var i$3 = 0, list$3 = geojson.geometry.geometries; i$3 < list$3.length; i$3 += 1) {
            var singleGeometry = list$3[i$3];

            convertFeature(features, {
                id: id,
                geometry: singleGeometry,
                properties: geojson.properties
            }, options, index);
        }
        return;
    } else {
        throw new Error('Input data is not a valid GeoJSON object.');
    }

    features.push(createFeature(id, type, geometry, geojson.properties));
}

function convertPoint(coords, out) {
    out.push(projectX(coords[0]), projectY(coords[1]), 0);
}

function convertLine(ring, out, tolerance, isPolygon) {
    var x0, y0;
    var size = 0;

    for (var j = 0; j < ring.length; j++) {
        var x = projectX(ring[j][0]);
        var y = projectY(ring[j][1]);

        out.push(x, y, 0);

        if (j > 0) {
            if (isPolygon) {
                size += (x0 * y - x * y0) / 2; // area
            } else {
                size += Math.sqrt(Math.pow(x - x0, 2) + Math.pow(y - y0, 2)); // length
            }
        }
        x0 = x;
        y0 = y;
    }

    var last = out.length - 3;
    out[2] = 1;
    simplify(out, 0, last, tolerance);
    out[last + 2] = 1;

    out.size = Math.abs(size);
    out.start = 0;
    out.end = out.size;
}

function convertLines(rings, out, tolerance, isPolygon) {
    for (var i = 0; i < rings.length; i++) {
        var geom = [];
        convertLine(rings[i], geom, tolerance, isPolygon);
        out.push(geom);
    }
}

function projectX(x) {
    return x / 360 + 0.5;
}

function projectY(y) {
    var sin = Math.sin(y * Math.PI / 180);
    var y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}

/* clip features between two vertical or horizontal axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 *
 * k1 and k2 are the line coordinates
 * axis: 0 for x, 1 for y
 * minAll and maxAll: minimum and maximum coordinate value for all features
 */
function clip(features, scale, k1, k2, axis, minAll, maxAll, options) {
    k1 /= scale;
    k2 /= scale;

    if (minAll >= k1 && maxAll < k2) { return features; } // trivial accept
    else if (maxAll < k1 || minAll >= k2) { return null; } // trivial reject

    var clipped = [];

    for (var i$2 = 0, list$2 = features; i$2 < list$2.length; i$2 += 1) {
        var feature = list$2[i$2];

        var geometry = feature.geometry;
        var type = feature.type;

        var min = axis === 0 ? feature.minX : feature.minY;
        var max = axis === 0 ? feature.maxX : feature.maxY;

        if (min >= k1 && max < k2) { // trivial accept
            clipped.push(feature);
            continue;
        } else if (max < k1 || min >= k2) { // trivial reject
            continue;
        }

        var newGeometry = [];

        if (type === 'Point' || type === 'MultiPoint') {
            clipPoints(geometry, newGeometry, k1, k2, axis);

        } else if (type === 'LineString') {
            clipLine(geometry, newGeometry, k1, k2, axis, false, options.lineMetrics);

        } else if (type === 'MultiLineString') {
            clipLines(geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'Polygon') {
            clipLines(geometry, newGeometry, k1, k2, axis, true);

        } else if (type === 'MultiPolygon') {
            for (var i = 0, list = geometry; i < list.length; i += 1) {
                var polygon = list[i];

                var newPolygon = [];
                clipLines(polygon, newPolygon, k1, k2, axis, true);
                if (newPolygon.length) {
                    newGeometry.push(newPolygon);
                }
            }
        }

        if (newGeometry.length) {
            if (options.lineMetrics && type === 'LineString') {
                for (var i$1 = 0, list$1 = newGeometry; i$1 < list$1.length; i$1 += 1) {
                    var line = list$1[i$1];

                    clipped.push(createFeature(feature.id, type, line, feature.tags));
                }
                continue;
            }

            if (type === 'LineString' || type === 'MultiLineString') {
                if (newGeometry.length === 1) {
                    type = 'LineString';
                    newGeometry = newGeometry[0];
                } else {
                    type = 'MultiLineString';
                }
            }
            if (type === 'Point' || type === 'MultiPoint') {
                type = newGeometry.length === 3 ? 'Point' : 'MultiPoint';
            }

            clipped.push(createFeature(feature.id, type, newGeometry, feature.tags));
        }
    }

    return clipped.length ? clipped : null;
}

function clipPoints(geom, newGeom, k1, k2, axis) {
    for (var i = 0; i < geom.length; i += 3) {
        var a = geom[i + axis];

        if (a >= k1 && a <= k2) {
            addPoint(newGeom, geom[i], geom[i + 1], geom[i + 2]);
        }
    }
}

function clipLine(geom, newGeom, k1, k2, axis, isPolygon, trackMetrics) {

    var slice = newSlice(geom);
    var intersect = axis === 0 ? intersectX : intersectY;
    var len = geom.start;
    var segLen, t;

    for (var i = 0; i < geom.length - 3; i += 3) {
        var ax$1 = geom[i];
        var ay$1 = geom[i + 1];
        var az$1 = geom[i + 2];
        var bx = geom[i + 3];
        var by = geom[i + 4];
        var a$1 = axis === 0 ? ax$1 : ay$1;
        var b = axis === 0 ? bx : by;
        var exited = false;

        if (trackMetrics) { segLen = Math.sqrt(Math.pow(ax$1 - bx, 2) + Math.pow(ay$1 - by, 2)); }

        if (a$1 < k1) {
            // ---|-->  | (line enters the clip region from the left)
            if (b > k1) {
                t = intersect(slice, ax$1, ay$1, bx, by, k1);
                if (trackMetrics) { slice.start = len + segLen * t; }
            }
        } else if (a$1 > k2) {
            // |  <--|--- (line enters the clip region from the right)
            if (b < k2) {
                t = intersect(slice, ax$1, ay$1, bx, by, k2);
                if (trackMetrics) { slice.start = len + segLen * t; }
            }
        } else {
            addPoint(slice, ax$1, ay$1, az$1);
        }
        if (b < k1 && a$1 >= k1) {
            // <--|---  | or <--|-----|--- (line exits the clip region on the left)
            t = intersect(slice, ax$1, ay$1, bx, by, k1);
            exited = true;
        }
        if (b > k2 && a$1 <= k2) {
            // |  ---|--> or ---|-----|--> (line exits the clip region on the right)
            t = intersect(slice, ax$1, ay$1, bx, by, k2);
            exited = true;
        }

        if (!isPolygon && exited) {
            if (trackMetrics) { slice.end = len + segLen * t; }
            newGeom.push(slice);
            slice = newSlice(geom);
        }

        if (trackMetrics) { len += segLen; }
    }

    // add the last point
    var last = geom.length - 3;
    var ax = geom[last];
    var ay = geom[last + 1];
    var az = geom[last + 2];
    var a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) { addPoint(slice, ax, ay, az); }

    // close the polygon if its endpoints are not the same after clipping
    last = slice.length - 3;
    if (isPolygon && last >= 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1])) {
        addPoint(slice, slice[0], slice[1], slice[2]);
    }

    // add the final slice
    if (slice.length) {
        newGeom.push(slice);
    }
}

function newSlice(line) {
    var slice = [];
    slice.size = line.size;
    slice.start = line.start;
    slice.end = line.end;
    return slice;
}

function clipLines(geom, newGeom, k1, k2, axis, isPolygon) {
    for (var i = 0, list = geom; i < list.length; i += 1) {
        var line = list[i];

        clipLine(line, newGeom, k1, k2, axis, isPolygon, false);
    }
}

function addPoint(out, x, y, z) {
    out.push(x, y, z);
}

function intersectX(out, ax, ay, bx, by, x) {
    var t = (x - ax) / (bx - ax);
    addPoint(out, x, ay + (by - ay) * t, 1);
    return t;
}

function intersectY(out, ax, ay, bx, by, y) {
    var t = (y - ay) / (by - ay);
    addPoint(out, ax + (bx - ax) * t, y, 1);
    return t;
}

function wrap(features, options) {
    var buffer = options.buffer / options.extent;
    var merged = features;
    var left  = clip(features, 1, -1 - buffer, buffer,     0, -1, 2, options); // left world copy
    var right = clip(features, 1,  1 - buffer, 2 + buffer, 0, -1, 2, options); // right world copy

    if (left || right) {
        merged = clip(features, 1, -buffer, 1 + buffer, 0, -1, 2, options) || []; // center world copy

        if (left) { merged = shiftFeatureCoords(left, 1).concat(merged); } // merge left into center
        if (right) { merged = merged.concat(shiftFeatureCoords(right, -1)); } // merge right into center
    }

    return merged;
}

function shiftFeatureCoords(features, offset) {
    var newFeatures = [];

    for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        var type = feature.type;

        var newGeometry = (void 0);

        if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
            newGeometry = shiftCoords(feature.geometry, offset);

        } else if (type === 'MultiLineString' || type === 'Polygon') {
            newGeometry = [];
            for (var i$1 = 0, list = feature.geometry; i$1 < list.length; i$1 += 1) {
                var line = list[i$1];

                newGeometry.push(shiftCoords(line, offset));
            }
        } else if (type === 'MultiPolygon') {
            newGeometry = [];
            for (var i$3 = 0, list$2 = feature.geometry; i$3 < list$2.length; i$3 += 1) {
                var polygon = list$2[i$3];

                var newPolygon = [];
                for (var i$2 = 0, list$1 = polygon; i$2 < list$1.length; i$2 += 1) {
                    var line$1 = list$1[i$2];

                    newPolygon.push(shiftCoords(line$1, offset));
                }
                newGeometry.push(newPolygon);
            }
        }

        newFeatures.push(createFeature(feature.id, type, newGeometry, feature.tags));
    }

    return newFeatures;
}

function shiftCoords(points, offset) {
    var newPoints = [];
    newPoints.size = points.size;

    if (points.start !== undefined) {
        newPoints.start = points.start;
        newPoints.end = points.end;
    }

    for (var i = 0; i < points.length; i += 3) {
        newPoints.push(points[i] + offset, points[i + 1], points[i + 2]);
    }
    return newPoints;
}

// Transforms the coordinates of each feature in the given tile from
// mercator-projected space into (extent x extent) tile space.
function transformTile(tile, extent) {
    if (tile.transformed) { return tile; }

    var z2 = 1 << tile.z;
    var tx = tile.x;
    var ty = tile.y;

    for (var i = 0, list = tile.features; i < list.length; i += 1) {
        var feature = list[i];

        var geom = feature.geometry;
        var type = feature.type;

        feature.geometry = [];

        if (type === 1) {
            for (var j = 0; j < geom.length; j += 2) {
                feature.geometry.push(transformPoint(geom[j], geom[j + 1], extent, z2, tx, ty));
            }
        } else {
            for (var j$1 = 0; j$1 < geom.length; j$1++) {
                var ring = [];
                for (var k = 0; k < geom[j$1].length; k += 2) {
                    ring.push(transformPoint(geom[j$1][k], geom[j$1][k + 1], extent, z2, tx, ty));
                }
                feature.geometry.push(ring);
            }
        }
    }

    tile.transformed = true;

    return tile;
}

function transformPoint(x, y, extent, z2, tx, ty) {
    return [
        Math.round(extent * (x * z2 - tx)),
        Math.round(extent * (y * z2 - ty))];
}

function createTile(features, z, tx, ty, options) {
    var tolerance = z === options.maxZoom ? 0 : options.tolerance / ((1 << z) * options.extent);
    var tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: features.length,
        source: null,
        x: tx,
        y: ty,
        z: z,
        transformed: false,
        minX: 2,
        minY: 1,
        maxX: -1,
        maxY: 0
    };
    for (var i = 0, list = features; i < list.length; i += 1) {
        var feature = list[i];

        addFeature(tile, feature, tolerance, options);
    }
    return tile;
}

function addFeature(tile, feature, tolerance, options) {
    var geom = feature.geometry;
    var type = feature.type;
    var simplified = [];

    tile.minX = Math.min(tile.minX, feature.minX);
    tile.minY = Math.min(tile.minY, feature.minY);
    tile.maxX = Math.max(tile.maxX, feature.maxX);
    tile.maxY = Math.max(tile.maxY, feature.maxY);

    if (type === 'Point' || type === 'MultiPoint') {
        for (var i = 0; i < geom.length; i += 3) {
            simplified.push(geom[i], geom[i + 1]);
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        addLine(simplified, geom, tile, tolerance, false, false);

    } else if (type === 'MultiLineString' || type === 'Polygon') {
        for (var i$1 = 0; i$1 < geom.length; i$1++) {
            addLine(simplified, geom[i$1], tile, tolerance, type === 'Polygon', i$1 === 0);
        }

    } else if (type === 'MultiPolygon') {

        for (var k = 0; k < geom.length; k++) {
            var polygon = geom[k];
            for (var i$2 = 0; i$2 < polygon.length; i$2++) {
                addLine(simplified, polygon[i$2], tile, tolerance, true, i$2 === 0);
            }
        }
    }

    if (simplified.length) {
        var tags = feature.tags || null;

        if (type === 'LineString' && options.lineMetrics) {
            tags = {};
            for (var key in feature.tags) { tags[key] = feature.tags[key]; }
            tags['mapbox_clip_start'] = geom.start / geom.size;
            tags['mapbox_clip_end'] = geom.end / geom.size;
        }

        var tileFeature = {
            geometry: simplified,
            type: type === 'Polygon' || type === 'MultiPolygon' ? 3 :
            (type === 'LineString' || type === 'MultiLineString' ? 2 : 1),
            tags: tags
        };
        if (feature.id !== null) {
            tileFeature.id = feature.id;
        }
        tile.features.push(tileFeature);
    }
}

function addLine(result, geom, tile, tolerance, isPolygon, isOuter) {
    var sqTolerance = tolerance * tolerance;

    if (tolerance > 0 && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += geom.length / 3;
        return;
    }

    var ring = [];

    for (var i = 0; i < geom.length; i += 3) {
        if (tolerance === 0 || geom[i + 2] > sqTolerance) {
            tile.numSimplified++;
            ring.push(geom[i], geom[i + 1]);
        }
        tile.numPoints++;
    }

    if (isPolygon) { rewind(ring, isOuter); }

    result.push(ring);
}

function rewind(ring, clockwise) {
    var area = 0;
    for (var i = 0, len = ring.length, j = len - 2; i < len; j = i, i += 2) {
        area += (ring[i] - ring[j]) * (ring[i + 1] + ring[j + 1]);
    }
    if (area > 0 === clockwise) {
        for (var i$1 = 0, len$1 = ring.length; i$1 < len$1 / 2; i$1 += 2) {
            var x = ring[i$1];
            var y = ring[i$1 + 1];
            ring[i$1] = ring[len$1 - 2 - i$1];
            ring[i$1 + 1] = ring[len$1 - 1 - i$1];
            ring[len$1 - 2 - i$1] = x;
            ring[len$1 - 1 - i$1] = y;
        }
    }
}

var defaultOptions = {
    maxZoom: 14,            // max zoom to preserve detail on
    indexMaxZoom: 5,        // max zoom in the tile index
    indexMaxPoints: 100000, // max number of points per tile in the tile index
    tolerance: 3,           // simplification tolerance (higher means simpler)
    extent: 4096,           // tile extent
    buffer: 64,             // tile buffer on each side
    lineMetrics: false,     // whether to calculate line metrics
    promoteId: null,        // name of a feature property to be promoted to feature.id
    generateId: false,      // whether to generate feature ids. Cannot be used with promoteId
    debug: 0,                // logging level (0, 1 or 2)
    dynamicCache: true
};

var GeoJSONVT = function GeoJSONVT(data, options) {
    options = this.options = extend(Object.create(defaultOptions), options);

    var debug = options.debug;

    if (debug) { console.time('preprocess data'); }

    if (options.maxZoom < 0 || options.maxZoom > 24) { throw new Error('maxZoom should be in the 0-24 range'); }
    if (options.promoteId && options.generateId) { throw new Error('promoteId and generateId cannot be used together.'); }

    // projects and adds simplification info
    var features = convert(data, options);

    // tiles and tileCoords are part of the public API
    this.tiles = {};

    if (debug) {
        console.timeEnd('preprocess data');
        console.log('index: maxZoom: %d, maxPoints: %d', options.indexMaxZoom, options.indexMaxPoints);
        console.time('generate tiles');
        this.stats = {};
        this.total = 0;
    }

    // wraps features (ie extreme west and extreme east)
    features = wrap(features, options);

    // start slicing from the top tile down
    if (features.length) { this.splitTile(features, 0, 0, 0, undefined, undefined, undefined, true); }

    if (debug) {
        if (features.length) { console.log('features: %d, points: %d', this.tiles[0].numFeatures, this.tiles[0].numPoints); }
        console.timeEnd('generate tiles');
        console.log('tiles generated:', this.total, JSON.stringify(this.stats));
    }
};

// splits features from a parent tile to sub-tiles.
// z, x, and y are the coordinates of the parent tile
// cz, cx, and cy are the coordinates of the target tile
//
// If no target tile is specified, splitting stops when we reach the maximum
// zoom or the number of points is low as specified in the options.
GeoJSONVT.prototype.splitTile = function splitTile (features, z, x, y, cz, cx, cy, initializing) {

    var stack = [features, z, x, y];
    var options = this.options;
    var debug = options.debug;
    var tilesCache = (initializing || options.dynamicCache)? this.tiles : {};
    // avoid recursion by using a processing queue
    while (stack.length) {
        y = stack.pop();
        x = stack.pop();
        z = stack.pop();
        features = stack.pop();

        var z2 = 1 << z;
        var id = toID(z, x, y);
        var tile = tilesCache[id];

        if (!tile) {
            if (debug > 1) { console.time('creation'); }

            tile = tilesCache[id] = createTile(features, z, x, y, options);

            if (debug) {
                if (debug > 1) {
                    console.log('tile z%d-%d-%d (features: %d, points: %d, simplified: %d)',
                        z, x, y, tile.numFeatures, tile.numPoints, tile.numSimplified);
                    console.timeEnd('creation');
                }
                var key = "z" + z;
                this.stats[key] = (this.stats[key] || 0) + 1;
                this.total++;
            }
        }

        // save reference to original geometry in tile so that we can drill down later if we stop now
        tile.source = features;

        // if it's the first-pass tiling
        if (cz == null) {
            // stop tiling if we reached max zoom, or if the tile is too simple
            if (z === options.indexMaxZoom || tile.numPoints <= options.indexMaxPoints) { continue; }
        // if a drilldown to a specific tile
        } else if (z === options.maxZoom || z === cz) {
            // stop tiling if we reached base zoom or our target tile zoom
            continue;
        } else if (cz != null) {
            // stop tiling if it's not an ancestor of the target tile
            var zoomSteps = cz - z;
            if (x !== cx >> zoomSteps || y !== cy >> zoomSteps) { continue; }
        }

        // if we slice further down, no need to keep source geometry
        tile.source = null;

        if (features.length === 0) { continue; }

        if (debug > 1) { console.time('clipping'); }

        // values we'll use for clipping
        var k1 = 0.5 * options.buffer / options.extent;
        var k2 = 0.5 - k1;
        var k3 = 0.5 + k1;
        var k4 = 1 + k1;

        var tl = null;
        var bl = null;
        var tr = null;
        var br = null;

        var left  = clip(features, z2, x - k1, x + k3, 0, tile.minX, tile.maxX, options);
        var right = clip(features, z2, x + k2, x + k4, 0, tile.minX, tile.maxX, options);
        features = null;

        if (left) {
            tl = clip(left, z2, y - k1, y + k3, 1, tile.minY, tile.maxY, options);
            bl = clip(left, z2, y + k2, y + k4, 1, tile.minY, tile.maxY, options);
            left = null;
        }

        if (right) {
            tr = clip(right, z2, y - k1, y + k3, 1, tile.minY, tile.maxY, options);
            br = clip(right, z2, y + k2, y + k4, 1, tile.minY, tile.maxY, options);
            right = null;
        }

        if (debug > 1) { console.timeEnd('clipping'); }

        stack.push(tl || [], z + 1, x * 2, y * 2);
        stack.push(bl || [], z + 1, x * 2, y * 2 + 1);
        stack.push(tr || [], z + 1, x * 2 + 1, y * 2);
        stack.push(br || [], z + 1, x * 2 + 1, y * 2 + 1);
    }
    return tilesCache;
};

GeoJSONVT.prototype.getTile = function getTile (z, x, y) {
    z = +z;
    x = +x;
    y = +y;

    var options = this.options;
    var extent = options.extent;
        var debug = options.debug;

    if (z < 0 || z > 24) { return null; }

    var z2 = 1 << z;
    x = (x + z2) & (z2 - 1); // wrap tile x coordinate

    var id = toID(z, x, y);
    if (this.tiles[id]) { return transformTile(this.tiles[id], extent); }

    if (debug > 1) { console.log('drilling down to z%d-%d-%d', z, x, y); }

    var z0 = z;
    var x0 = x;
    var y0 = y;
    var parent;

    while (!parent && z0 > 0) {
        z0--;
        x0 = x0 >> 1;
        y0 = y0 >> 1;
        parent = this.tiles[toID(z0, x0, y0)];
    }

    if (!parent || !parent.source) { return null; }

    // if we found a parent tile containing the original geometry, we can drill down from it
    if (debug > 1) {
        console.log('found parent tile z%d-%d-%d', z0, x0, y0);
        console.time('drilling down');
    }
    var tilesCache = this.splitTile(parent.source, z0, x0, y0, z, x, y);
    if (debug > 1) { console.timeEnd('drilling down'); }

    return tilesCache[id] ? transformTile(tilesCache[id], extent) : null;
};

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

function extend(dest, src) {
    for (var i in src) { dest[i] = src[i]; }
    return dest;
}

function geojsonvt(data, options) {
    return new GeoJSONVT(data, options);
}

return geojsonvt;

}));

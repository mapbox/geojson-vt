(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.geojsonvt = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

module.exports = clip;

var createFeature = require('./feature');

/* clip features between two axis-parallel lines:
 *     |        |
 *  ___|___     |     /
 * /   |   \____|____/
 *     |        |
 */

function clip(features, scale, k1, k2, axis, minAll, maxAll) {

    k1 /= scale;
    k2 /= scale;

    if (minAll >= k1 && maxAll <= k2) return features; // trivial accept
    else if (minAll > k2 || maxAll < k1) return null; // trivial reject

    var clipped = [];

    for (var i = 0; i < features.length; i++) {

        var feature = features[i];
        var geometry = feature.geometry;
        var type = feature.type;

        var min = axis === 0 ? feature.minX : feature.minY;
        var max = axis === 0 ? feature.maxX : feature.maxY;

        if (min >= k1 && max <= k2) { // trivial accept
            clipped.push(feature);
            continue;
        } else if (min > k2 || max < k1) { // trivial reject
            continue;
        }

        var newGeometry = [];

        if (type === 'Point' || type === 'MultiPoint') {
            clipPoints(geometry, newGeometry, k1, k2, axis);

        } else if (type === 'LineString') {
            clipLine(geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'MultiLineString') {
            clipLines(geometry, newGeometry, k1, k2, axis, false);

        } else if (type === 'Polygon') {
            clipLines(geometry, newGeometry, k1, k2, axis, true);

        } else if (type === 'MultiPolygon') {
            for (var j = 0; j < geometry.length; j++) {
                var polygon = [];
                clipLines(geometry[j], polygon, k1, k2, axis, true);
                if (polygon.length) {
                    newGeometry.push(polygon);
                }
            }
        }

        if (newGeometry.length) {
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
            newGeom.push(geom[i]);
            newGeom.push(geom[i + 1]);
            newGeom.push(geom[i + 2]);
        }
    }
}

function clipLine(geom, newGeom, k1, k2, axis, isPolygon) {

    var slice = [];
    var intersect = axis === 0 ? intersectX : intersectY;

    for (var i = 0; i < geom.length - 3; i += 3) {
        var ax = geom[i];
        var ay = geom[i + 1];
        var az = geom[i + 2];
        var bx = geom[i + 3];
        var by = geom[i + 4];
        var a = axis === 0 ? ax : ay;
        var b = axis === 0 ? bx : by;
        var sliced = false;

        if (a < k1) {
            // ---|-->  |
            if (b >= k1) intersect(slice, ax, ay, bx, by, k1);
        } else if (a > k2) {
            // |  <--|---
            if (b <= k2) intersect(slice, ax, ay, bx, by, k2);
        } else {
            addPoint(slice, ax, ay, az);
        }
        if (b < k1 && a >= k1) {
            // <--|---  | or <--|-----|---
            intersect(slice, ax, ay, bx, by, k1);
            sliced = true;
        }
        if (b > k2 && a <= k2) {
            // |  ---|--> or ---|-----|-->
            intersect(slice, ax, ay, bx, by, k2);
            sliced = true;
        }

        if (!isPolygon && sliced) {
            slice.size = geom.size;
            newGeom.push(slice);
            slice = [];
        }
    }

    // add the last point
    var last = geom.length - 3;
    ax = geom[last];
    ay = geom[last + 1];
    az = geom[last + 2];
    a = axis === 0 ? ax : ay;
    if (a >= k1 && a <= k2) addPoint(slice, ax, ay, az);

    // close the polygon if its endpoints are not the same after clipping
    last = slice.length - 3;
    if (isPolygon && last >= 3 && (slice[last] !== slice[0] || slice[last + 1] !== slice[1])) {
        addPoint(slice, slice[0], slice[1], slice[2]);
    }

    // add the final slice
    if (slice.length) {
        slice.size = geom.size;
        newGeom.push(slice);
    }
}

function clipLines(geom, newGeom, k1, k2, axis, isPolygon) {
    for (var i = 0; i < geom.length; i++) {
        clipLine(geom[i], newGeom, k1, k2, axis, isPolygon);
    }
}

function addPoint(out, x, y, z) {
    out.push(x);
    out.push(y);
    out.push(z);
}

function intersectX(out, ax, ay, bx, by, x) {
    out.push(x);
    out.push(ay + (x - ax) * (by - ay) / (bx - ax));
    out.push(1);
}

function intersectY(out, ax, ay, bx, by, y) {
    out.push(ax + (y - ay) * (bx - ax) / (by - ay));
    out.push(y);
    out.push(1);
}

},{"./feature":3}],2:[function(require,module,exports){
'use strict';

module.exports = convert;

var simplify = require('./simplify');
var createFeature = require('./feature');

// converts GeoJSON feature into an intermediate projected JSON vector format with simplification data

function convert(data, tolerance) {
    var features = [];

    if (data.type === 'FeatureCollection') {
        for (var i = 0; i < data.features.length; i++) {
            convertFeature(features, data.features[i], tolerance);
        }

    } else if (data.type === 'Feature') {
        convertFeature(features, data, tolerance);

    } else {
        // single geometry or a geometry collection
        convertFeature(features, {geometry: data}, tolerance);
    }

    return features;
}

function convertFeature(features, geojson, tolerance) {
    if (!geojson.geometry) return;

    var coords = geojson.geometry.coordinates;
    var type = geojson.geometry.type;
    var tol = tolerance * tolerance;
    var geometry = [];

    if (type === 'Point') {
        convertPoint(coords, geometry);

    } else if (type === 'MultiPoint') {
        for (var i = 0; i < coords.length; i++) {
            convertPoint(coords[i], geometry);
        }

    } else if (type === 'LineString') {
        convertLine(coords, geometry, tol, false);

    } else if (type === 'MultiLineString') {
        convertLines(coords, geometry, tol, false);

    } else if (type === 'Polygon') {
        convertLines(coords, geometry, tol, true);

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < coords.length; i++) {
            var polygon = [];
            convertLines(coords[i], polygon, tol, true);
            geometry.push(polygon);
        }
    } else if (type === 'GeometryCollection') {
        for (i = 0; i < geojson.geometry.geometries.length; i++) {
            convertFeature(features, {
                geometry: geojson.geometry.geometries[i],
                properties: geojson.properties
            }, tolerance);
        }
        return;
    } else {
        throw new Error('Input data is not a valid GeoJSON object.');
    }

    features.push(createFeature(geojson.id, type, geometry, geojson.properties));
}

function convertPoint(coords, out) {
    out.push(projectX(coords[0]));
    out.push(projectY(coords[1]));
    out.push(0);
}

function convertLine(ring, out, tol, isPolygon) {
    var x0, y0;
    var size = 0;

    for (var j = 0; j < ring.length; j++) {
        var x = projectX(ring[j][0]);
        var y = projectY(ring[j][1]);

        out.push(x);
        out.push(y);
        out.push(0);

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
    simplify(out, 0, last, tol);
    out[last + 2] = 1;

    out.size = Math.abs(size);
}

function convertLines(rings, out, tol, isPolygon) {
    for (var i = 0; i < rings.length; i++) {
        var geom = [];
        convertLine(rings[i], geom, tol, isPolygon);
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

},{"./feature":3,"./simplify":5}],3:[function(require,module,exports){
'use strict';

module.exports = createFeature;

function createFeature(id, type, geom, tags) {
    var feature = {
        id: id || null,
        type: type,
        geometry: geom,
        tags: tags,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
    calcBBox(feature);
    return feature;
}

function calcBBox(feature) {
    var geom = feature.geometry;
    var type = feature.type;

    if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
        calcLineBBox(feature, geom);

    } else if (type === 'Polygon' || type === 'MultiLineString') {
        for (var i = 0; i < geom.length; i++) {
            calcLineBBox(feature, geom[i]);
        }

    } else if (type === 'MultiPolygon') {
        for (i = 0; i < geom.length; i++) {
            for (var j = 0; j < geom[i].length; j++) {
                calcLineBBox(feature, geom[i][j]);
            }
        }
    }
}

function calcLineBBox(feature, geom) {
    for (var i = 0; i < geom.length; i += 3) {
        feature.minX = Math.min(feature.minX, geom[i]);
        feature.minY = Math.min(feature.minY, geom[i + 1]);
        feature.maxX = Math.max(feature.maxX, geom[i]);
        feature.maxY = Math.max(feature.maxY, geom[i + 1]);
    }
}

},{}],4:[function(require,module,exports){
'use strict';

module.exports = geojsonvt;

var convert = require('./convert'),     // GeoJSON conversion and preprocessing
    transform = require('./transform'), // coordinate transformation
    clip = require('./clip'),           // stripe clipping algorithm
    wrap = require('./wrap'),           // date line processing
    createTile = require('./tile');     // final simplified tile generation


function geojsonvt(data, options) {
    return new GeoJSONVT(data, options);
}

function GeoJSONVT(data, options) {
    options = this.options = extend(Object.create(this.options), options);

    var debug = options.debug;

    if (debug) console.time('preprocess data');

    if (options.maxZoom < 0 || options.maxZoom > 24) throw new Error('maxZoom should be in the 0-24 range');

    var z2 = 1 << options.maxZoom, // 2^z
        features = convert(data, options.tolerance / (z2 * options.extent));

    this.tiles = {};
    this.tileCoords = [];

    if (debug) {
        console.timeEnd('preprocess data');
        console.log('index: maxZoom: %d, maxPoints: %d', options.indexMaxZoom, options.indexMaxPoints);
        console.time('generate tiles');
        this.stats = {};
        this.total = 0;
    }

    features = wrap(features, options.buffer / options.extent);

    // start slicing from the top tile down
    if (features.length) this.splitTile(features, 0, 0, 0);

    if (debug) {
        if (features.length) console.log('features: %d, points: %d', this.tiles[0].numFeatures, this.tiles[0].numPoints);
        console.timeEnd('generate tiles');
        console.log('tiles generated:', this.total, JSON.stringify(this.stats));
    }
}

GeoJSONVT.prototype.options = {
    maxZoom: 14,            // max zoom to preserve detail on
    indexMaxZoom: 5,        // max zoom in the tile index
    indexMaxPoints: 100000, // max number of points per tile in the tile index
    tolerance: 3,           // simplification tolerance (higher means simpler)
    extent: 4096,           // tile extent
    buffer: 64,             // tile buffer on each side
    debug: 0                // logging level (0, 1 or 2)
};

GeoJSONVT.prototype.splitTile = function (features, z, x, y, cz, cx, cy) {

    var stack = [features, z, x, y],
        options = this.options,
        debug = options.debug;

    // avoid recursion by using a processing queue
    while (stack.length) {
        y = stack.pop();
        x = stack.pop();
        z = stack.pop();
        features = stack.pop();

        var z2 = 1 << z,
            id = toID(z, x, y),
            tile = this.tiles[id],
            tileTolerance = z === options.maxZoom ? 0 : options.tolerance / (z2 * options.extent);

        if (!tile) {
            if (debug > 1) console.time('creation');

            tile = this.tiles[id] = createTile(features, z2, x, y, tileTolerance, z === options.maxZoom);
            this.tileCoords.push({z: z, x: x, y: y});

            if (debug) {
                if (debug > 1) {
                    console.log('tile z%d-%d-%d (features: %d, points: %d, simplified: %d)',
                        z, x, y, tile.numFeatures, tile.numPoints, tile.numSimplified);
                    console.timeEnd('creation');
                }
                var key = 'z' + z;
                this.stats[key] = (this.stats[key] || 0) + 1;
                this.total++;
            }
        }

        // save reference to original geometry in tile so that we can drill down later if we stop now
        tile.source = features;

        // if it's the first-pass tiling
        if (!cz) {
            // stop tiling if we reached max zoom, or if the tile is too simple
            if (z === options.indexMaxZoom || tile.numPoints <= options.indexMaxPoints) continue;

        // if a drilldown to a specific tile
        } else {
            // stop tiling if we reached base zoom or our target tile zoom
            if (z === options.maxZoom || z === cz) continue;

            // stop tiling if it's not an ancestor of the target tile
            var m = 1 << (cz - z);
            if (x !== Math.floor(cx / m) || y !== Math.floor(cy / m)) continue;
        }

        // if we slice further down, no need to keep source geometry
        tile.source = null;

        if (features.length === 0) continue;

        if (debug > 1) console.time('clipping');

        // values we'll use for clipping
        var k1 = 0.5 * options.buffer / options.extent,
            k2 = 0.5 - k1,
            k3 = 0.5 + k1,
            k4 = 1 + k1,
            tl, bl, tr, br, left, right;

        tl = bl = tr = br = null;

        left  = clip(features, z2, x - k1, x + k3, 0, tile.minX, tile.maxX);
        right = clip(features, z2, x + k2, x + k4, 0, tile.minX, tile.maxX);
        features = null;

        if (left) {
            tl = clip(left, z2, y - k1, y + k3, 1, tile.minY, tile.maxY);
            bl = clip(left, z2, y + k2, y + k4, 1, tile.minY, tile.maxY);
            left = null;
        }

        if (right) {
            tr = clip(right, z2, y - k1, y + k3, 1, tile.minY, tile.maxY);
            br = clip(right, z2, y + k2, y + k4, 1, tile.minY, tile.maxY);
            right = null;
        }

        if (debug > 1) console.timeEnd('clipping');

        stack.push(tl || [], z + 1, x * 2,     y * 2);
        stack.push(bl || [], z + 1, x * 2,     y * 2 + 1);
        stack.push(tr || [], z + 1, x * 2 + 1, y * 2);
        stack.push(br || [], z + 1, x * 2 + 1, y * 2 + 1);
    }
};

GeoJSONVT.prototype.getTile = function (z, x, y) {
    var options = this.options,
        extent = options.extent,
        debug = options.debug;

    if (z < 0 || z > 24) return null;

    var z2 = 1 << z;
    x = ((x % z2) + z2) % z2; // wrap tile x coordinate

    var id = toID(z, x, y);
    if (this.tiles[id]) return transform.tile(this.tiles[id], extent);

    if (debug > 1) console.log('drilling down to z%d-%d-%d', z, x, y);

    var z0 = z,
        x0 = x,
        y0 = y,
        parent;

    while (!parent && z0 > 0) {
        z0--;
        x0 = Math.floor(x0 / 2);
        y0 = Math.floor(y0 / 2);
        parent = this.tiles[toID(z0, x0, y0)];
    }

    if (!parent || !parent.source) return null;

    // if we found a parent tile containing the original geometry, we can drill down from it
    if (debug > 1) console.log('found parent tile z%d-%d-%d', z0, x0, y0);

    if (debug > 1) console.time('drilling down');
    this.splitTile(parent.source, z0, x0, y0, z, x, y);
    if (debug > 1) console.timeEnd('drilling down');

    return this.tiles[id] ? transform.tile(this.tiles[id], extent) : null;
};

function toID(z, x, y) {
    return (((1 << z) * y + x) * 32) + z;
}

function extend(dest, src) {
    for (var i in src) dest[i] = src[i];
    return dest;
}

},{"./clip":1,"./convert":2,"./tile":6,"./transform":7,"./wrap":8}],5:[function(require,module,exports){
'use strict';

module.exports = simplify;

// calculate simplification data using optimized Douglas-Peucker algorithm

function simplify(coords, first, last, sqTolerance) {
    var maxSqDist = sqTolerance;
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
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 3) simplify(coords, first, index, sqTolerance);
        coords[index + 2] = maxSqDist;
        if (last - index > 3) simplify(coords, index, last, sqTolerance);
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

},{}],6:[function(require,module,exports){
'use strict';

module.exports = createTile;

function createTile(features, z2, tx, ty, tolerance, noSimplify) {
    var tile = {
        features: [],
        numPoints: 0,
        numSimplified: 0,
        numFeatures: 0,
        source: null,
        x: tx,
        y: ty,
        z2: z2,
        transformed: false,
        minX: 2,
        minY: 1,
        maxX: -1,
        maxY: 0
    };
    for (var i = 0; i < features.length; i++) {
        tile.numFeatures++;
        addFeature(tile, features[i], tolerance, noSimplify);

        var minX = features[i].minX;
        var minY = features[i].minY;
        var maxX = features[i].maxX;
        var maxY = features[i].maxY;

        if (minX < tile.minX) tile.minX = minX;
        if (minY < tile.minY) tile.minY = minY;
        if (maxX > tile.maxX) tile.maxX = maxX;
        if (maxY > tile.maxY) tile.maxY = maxY;
    }
    return tile;
}

function addFeature(tile, feature, tolerance, noSimplify) {

    var geom = feature.geometry,
        type = feature.type,
        simplified = [];

    if (type === 'Point' || type === 'MultiPoint') {
        for (var i = 0; i < geom.length; i += 3) {
            simplified.push(geom[i]);
            simplified.push(geom[i + 1]);
            tile.numPoints++;
            tile.numSimplified++;
        }

    } else if (type === 'LineString') {
        addLine(simplified, geom, tile, tolerance, noSimplify, false, false);

    } else if (type === 'MultiLineString' || type === 'Polygon') {
        for (i = 0; i < geom.length; i++) {
            addLine(simplified, geom[i], tile, tolerance, noSimplify, type === 'Polygon', i === 0);
        }

    } else if (type === 'MultiPolygon') {

        for (var k = 0; k < geom.length; k++) {
            var polygon = geom[k];
            for (i = 0; i < polygon.length; i++) {
                addLine(simplified, polygon[i], tile, tolerance, noSimplify, true, i === 0);
            }
        }
    }

    if (simplified.length) {
        var tileFeature = {
            geometry: simplified,
            type: type === 'Polygon' || type === 'MultiPolygon' ? 3 :
                type === 'LineString' || type === 'MultiLineString' ? 2 : 1,
            tags: feature.tags || null
        };
        if (feature.id !== null) {
            tileFeature.id = feature.id;
        }
        tile.features.push(tileFeature);
    }
}

function addLine(result, geom, tile, tolerance, noSimplify, isPolygon, isOuter) {
    var sqTolerance = tolerance * tolerance;

    if (!noSimplify && (geom.size < (isPolygon ? sqTolerance : tolerance))) {
        tile.numPoints += geom.length / 3;
        return;
    }

    var ring = [];

    for (var i = 0; i < geom.length; i += 3) {
        if (noSimplify || geom[i + 2] > sqTolerance) {
            tile.numSimplified++;
            ring.push(geom[i]);
            ring.push(geom[i + 1]);
        }
        tile.numPoints++;
    }

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

},{}],7:[function(require,module,exports){
'use strict';

exports.tile = transformTile;
exports.point = transformPoint;

// Transforms the coordinates of each feature in the given tile from
// mercator-projected space into (extent x extent) tile space.
function transformTile(tile, extent) {
    if (tile.transformed) return tile;

    var z2 = tile.z2,
        tx = tile.x,
        ty = tile.y,
        i, j, k;

    for (i = 0; i < tile.features.length; i++) {
        var feature = tile.features[i],
            geom = feature.geometry,
            type = feature.type;

        feature.geometry = [];

        if (type === 1) {
            for (j = 0; j < geom.length; j += 2) {
                feature.geometry.push(transformPoint(geom[j], geom[j + 1], extent, z2, tx, ty));
            }
        } else {
            for (j = 0; j < geom.length; j++) {
                var ring = [];
                for (k = 0; k < geom[j].length; k += 2) {
                    ring.push(transformPoint(geom[j][k], geom[j][k + 1], extent, z2, tx, ty));
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

},{}],8:[function(require,module,exports){
'use strict';

var clip = require('./clip');
var createFeature = require('./feature');

module.exports = wrap;

function wrap(features, buffer) {
    var merged = features,
        left  = clip(features, 1, -1 - buffer, buffer,     0, -1, 2), // left world copy
        right = clip(features, 1,  1 - buffer, 2 + buffer, 0, -1, 2); // right world copy

    if (left || right) {
        merged = clip(features, 1, -buffer, 1 + buffer, 0, -1, 2) || []; // center world copy

        if (left) merged = shiftFeatureCoords(left, 1).concat(merged); // merge left into center
        if (right) merged = merged.concat(shiftFeatureCoords(right, -1)); // merge right into center
    }

    return merged;
}

function shiftFeatureCoords(features, offset) {
    var newFeatures = [];

    for (var i = 0; i < features.length; i++) {
        var feature = features[i],
            type = feature.type;

        var newGeometry;

        if (type === 'Point' || type === 'MultiPoint' || type === 'LineString') {
            newGeometry = shiftCoords(feature.geometry, offset);

        } else if (type === 'MultiLineString' || type === 'Polygon') {
            newGeometry = [];
            for (var j = 0; j < feature.geometry.length; j++) {
                newGeometry.push(shiftCoords(feature.geometry[j], offset));
            }
        } else if (type === 'MultiPolygon') {
            newGeometry = [];
            for (j = 0; j < feature.geometry.length; j++) {
                var newPolygon = [];
                for (var k = 0; k < feature.geometry[j].length; k++) {
                    newPolygon.push(shiftCoords(feature.geometry[j][k], offset));
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

    for (var i = 0; i < points.length; i += 3) {
        newPoints.push(points[i] + offset, points[i + 1], points[i + 2]);
    }
    return newPoints;
}

},{"./clip":1,"./feature":3}]},{},[4])(4)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvY2xpcC5qcyIsInNyYy9jb252ZXJ0LmpzIiwic3JjL2ZlYXR1cmUuanMiLCJzcmMvaW5kZXguanMiLCJzcmMvc2ltcGxpZnkuanMiLCJzcmMvdGlsZS5qcyIsInNyYy90cmFuc2Zvcm0uanMiLCJzcmMvd3JhcC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gY2xpcDtcblxudmFyIGNyZWF0ZUZlYXR1cmUgPSByZXF1aXJlKCcuL2ZlYXR1cmUnKTtcblxuLyogY2xpcCBmZWF0dXJlcyBiZXR3ZWVuIHR3byBheGlzLXBhcmFsbGVsIGxpbmVzOlxuICogICAgIHwgICAgICAgIHxcbiAqICBfX198X19fICAgICB8ICAgICAvXG4gKiAvICAgfCAgIFxcX19fX3xfX19fL1xuICogICAgIHwgICAgICAgIHxcbiAqL1xuXG5mdW5jdGlvbiBjbGlwKGZlYXR1cmVzLCBzY2FsZSwgazEsIGsyLCBheGlzLCBtaW5BbGwsIG1heEFsbCkge1xuXG4gICAgazEgLz0gc2NhbGU7XG4gICAgazIgLz0gc2NhbGU7XG5cbiAgICBpZiAobWluQWxsID49IGsxICYmIG1heEFsbCA8PSBrMikgcmV0dXJuIGZlYXR1cmVzOyAvLyB0cml2aWFsIGFjY2VwdFxuICAgIGVsc2UgaWYgKG1pbkFsbCA+IGsyIHx8IG1heEFsbCA8IGsxKSByZXR1cm4gbnVsbDsgLy8gdHJpdmlhbCByZWplY3RcblxuICAgIHZhciBjbGlwcGVkID0gW107XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZlYXR1cmVzLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgdmFyIGZlYXR1cmUgPSBmZWF0dXJlc1tpXTtcbiAgICAgICAgdmFyIGdlb21ldHJ5ID0gZmVhdHVyZS5nZW9tZXRyeTtcbiAgICAgICAgdmFyIHR5cGUgPSBmZWF0dXJlLnR5cGU7XG5cbiAgICAgICAgdmFyIG1pbiA9IGF4aXMgPT09IDAgPyBmZWF0dXJlLm1pblggOiBmZWF0dXJlLm1pblk7XG4gICAgICAgIHZhciBtYXggPSBheGlzID09PSAwID8gZmVhdHVyZS5tYXhYIDogZmVhdHVyZS5tYXhZO1xuXG4gICAgICAgIGlmIChtaW4gPj0gazEgJiYgbWF4IDw9IGsyKSB7IC8vIHRyaXZpYWwgYWNjZXB0XG4gICAgICAgICAgICBjbGlwcGVkLnB1c2goZmVhdHVyZSk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfSBlbHNlIGlmIChtaW4gPiBrMiB8fCBtYXggPCBrMSkgeyAvLyB0cml2aWFsIHJlamVjdFxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbmV3R2VvbWV0cnkgPSBbXTtcblxuICAgICAgICBpZiAodHlwZSA9PT0gJ1BvaW50JyB8fCB0eXBlID09PSAnTXVsdGlQb2ludCcpIHtcbiAgICAgICAgICAgIGNsaXBQb2ludHMoZ2VvbWV0cnksIG5ld0dlb21ldHJ5LCBrMSwgazIsIGF4aXMpO1xuXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ0xpbmVTdHJpbmcnKSB7XG4gICAgICAgICAgICBjbGlwTGluZShnZW9tZXRyeSwgbmV3R2VvbWV0cnksIGsxLCBrMiwgYXhpcywgZmFsc2UpO1xuXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ011bHRpTGluZVN0cmluZycpIHtcbiAgICAgICAgICAgIGNsaXBMaW5lcyhnZW9tZXRyeSwgbmV3R2VvbWV0cnksIGsxLCBrMiwgYXhpcywgZmFsc2UpO1xuXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgICAgICBjbGlwTGluZXMoZ2VvbWV0cnksIG5ld0dlb21ldHJ5LCBrMSwgazIsIGF4aXMsIHRydWUpO1xuXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ011bHRpUG9seWdvbicpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZ2VvbWV0cnkubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgcG9seWdvbiA9IFtdO1xuICAgICAgICAgICAgICAgIGNsaXBMaW5lcyhnZW9tZXRyeVtqXSwgcG9seWdvbiwgazEsIGsyLCBheGlzLCB0cnVlKTtcbiAgICAgICAgICAgICAgICBpZiAocG9seWdvbi5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3R2VvbWV0cnkucHVzaChwb2x5Z29uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmV3R2VvbWV0cnkubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ0xpbmVTdHJpbmcnIHx8IHR5cGUgPT09ICdNdWx0aUxpbmVTdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgaWYgKG5ld0dlb21ldHJ5Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gJ0xpbmVTdHJpbmcnO1xuICAgICAgICAgICAgICAgICAgICBuZXdHZW9tZXRyeSA9IG5ld0dlb21ldHJ5WzBdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGUgPSAnTXVsdGlMaW5lU3RyaW5nJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ1BvaW50JyB8fCB0eXBlID09PSAnTXVsdGlQb2ludCcpIHtcbiAgICAgICAgICAgICAgICB0eXBlID0gbmV3R2VvbWV0cnkubGVuZ3RoID09PSAzID8gJ1BvaW50JyA6ICdNdWx0aVBvaW50JztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2xpcHBlZC5wdXNoKGNyZWF0ZUZlYXR1cmUoZmVhdHVyZS5pZCwgdHlwZSwgbmV3R2VvbWV0cnksIGZlYXR1cmUudGFncykpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGNsaXBwZWQubGVuZ3RoID8gY2xpcHBlZCA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGNsaXBQb2ludHMoZ2VvbSwgbmV3R2VvbSwgazEsIGsyLCBheGlzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnZW9tLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgICAgIHZhciBhID0gZ2VvbVtpICsgYXhpc107XG5cbiAgICAgICAgaWYgKGEgPj0gazEgJiYgYSA8PSBrMikge1xuICAgICAgICAgICAgbmV3R2VvbS5wdXNoKGdlb21baV0pO1xuICAgICAgICAgICAgbmV3R2VvbS5wdXNoKGdlb21baSArIDFdKTtcbiAgICAgICAgICAgIG5ld0dlb20ucHVzaChnZW9tW2kgKyAyXSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNsaXBMaW5lKGdlb20sIG5ld0dlb20sIGsxLCBrMiwgYXhpcywgaXNQb2x5Z29uKSB7XG5cbiAgICB2YXIgc2xpY2UgPSBbXTtcbiAgICB2YXIgaW50ZXJzZWN0ID0gYXhpcyA9PT0gMCA/IGludGVyc2VjdFggOiBpbnRlcnNlY3RZO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnZW9tLmxlbmd0aCAtIDM7IGkgKz0gMykge1xuICAgICAgICB2YXIgYXggPSBnZW9tW2ldO1xuICAgICAgICB2YXIgYXkgPSBnZW9tW2kgKyAxXTtcbiAgICAgICAgdmFyIGF6ID0gZ2VvbVtpICsgMl07XG4gICAgICAgIHZhciBieCA9IGdlb21baSArIDNdO1xuICAgICAgICB2YXIgYnkgPSBnZW9tW2kgKyA0XTtcbiAgICAgICAgdmFyIGEgPSBheGlzID09PSAwID8gYXggOiBheTtcbiAgICAgICAgdmFyIGIgPSBheGlzID09PSAwID8gYnggOiBieTtcbiAgICAgICAgdmFyIHNsaWNlZCA9IGZhbHNlO1xuXG4gICAgICAgIGlmIChhIDwgazEpIHtcbiAgICAgICAgICAgIC8vIC0tLXwtLT4gIHxcbiAgICAgICAgICAgIGlmIChiID49IGsxKSBpbnRlcnNlY3Qoc2xpY2UsIGF4LCBheSwgYngsIGJ5LCBrMSk7XG4gICAgICAgIH0gZWxzZSBpZiAoYSA+IGsyKSB7XG4gICAgICAgICAgICAvLyB8ICA8LS18LS0tXG4gICAgICAgICAgICBpZiAoYiA8PSBrMikgaW50ZXJzZWN0KHNsaWNlLCBheCwgYXksIGJ4LCBieSwgazIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWRkUG9pbnQoc2xpY2UsIGF4LCBheSwgYXopO1xuICAgICAgICB9XG4gICAgICAgIGlmIChiIDwgazEgJiYgYSA+PSBrMSkge1xuICAgICAgICAgICAgLy8gPC0tfC0tLSAgfCBvciA8LS18LS0tLS18LS0tXG4gICAgICAgICAgICBpbnRlcnNlY3Qoc2xpY2UsIGF4LCBheSwgYngsIGJ5LCBrMSk7XG4gICAgICAgICAgICBzbGljZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChiID4gazIgJiYgYSA8PSBrMikge1xuICAgICAgICAgICAgLy8gfCAgLS0tfC0tPiBvciAtLS18LS0tLS18LS0+XG4gICAgICAgICAgICBpbnRlcnNlY3Qoc2xpY2UsIGF4LCBheSwgYngsIGJ5LCBrMik7XG4gICAgICAgICAgICBzbGljZWQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFpc1BvbHlnb24gJiYgc2xpY2VkKSB7XG4gICAgICAgICAgICBzbGljZS5zaXplID0gZ2VvbS5zaXplO1xuICAgICAgICAgICAgbmV3R2VvbS5wdXNoKHNsaWNlKTtcbiAgICAgICAgICAgIHNsaWNlID0gW107XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBhZGQgdGhlIGxhc3QgcG9pbnRcbiAgICB2YXIgbGFzdCA9IGdlb20ubGVuZ3RoIC0gMztcbiAgICBheCA9IGdlb21bbGFzdF07XG4gICAgYXkgPSBnZW9tW2xhc3QgKyAxXTtcbiAgICBheiA9IGdlb21bbGFzdCArIDJdO1xuICAgIGEgPSBheGlzID09PSAwID8gYXggOiBheTtcbiAgICBpZiAoYSA+PSBrMSAmJiBhIDw9IGsyKSBhZGRQb2ludChzbGljZSwgYXgsIGF5LCBheik7XG5cbiAgICAvLyBjbG9zZSB0aGUgcG9seWdvbiBpZiBpdHMgZW5kcG9pbnRzIGFyZSBub3QgdGhlIHNhbWUgYWZ0ZXIgY2xpcHBpbmdcbiAgICBsYXN0ID0gc2xpY2UubGVuZ3RoIC0gMztcbiAgICBpZiAoaXNQb2x5Z29uICYmIGxhc3QgPj0gMyAmJiAoc2xpY2VbbGFzdF0gIT09IHNsaWNlWzBdIHx8IHNsaWNlW2xhc3QgKyAxXSAhPT0gc2xpY2VbMV0pKSB7XG4gICAgICAgIGFkZFBvaW50KHNsaWNlLCBzbGljZVswXSwgc2xpY2VbMV0sIHNsaWNlWzJdKTtcbiAgICB9XG5cbiAgICAvLyBhZGQgdGhlIGZpbmFsIHNsaWNlXG4gICAgaWYgKHNsaWNlLmxlbmd0aCkge1xuICAgICAgICBzbGljZS5zaXplID0gZ2VvbS5zaXplO1xuICAgICAgICBuZXdHZW9tLnB1c2goc2xpY2UpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY2xpcExpbmVzKGdlb20sIG5ld0dlb20sIGsxLCBrMiwgYXhpcywgaXNQb2x5Z29uKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnZW9tLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNsaXBMaW5lKGdlb21baV0sIG5ld0dlb20sIGsxLCBrMiwgYXhpcywgaXNQb2x5Z29uKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFkZFBvaW50KG91dCwgeCwgeSwgeikge1xuICAgIG91dC5wdXNoKHgpO1xuICAgIG91dC5wdXNoKHkpO1xuICAgIG91dC5wdXNoKHopO1xufVxuXG5mdW5jdGlvbiBpbnRlcnNlY3RYKG91dCwgYXgsIGF5LCBieCwgYnksIHgpIHtcbiAgICBvdXQucHVzaCh4KTtcbiAgICBvdXQucHVzaChheSArICh4IC0gYXgpICogKGJ5IC0gYXkpIC8gKGJ4IC0gYXgpKTtcbiAgICBvdXQucHVzaCgxKTtcbn1cblxuZnVuY3Rpb24gaW50ZXJzZWN0WShvdXQsIGF4LCBheSwgYngsIGJ5LCB5KSB7XG4gICAgb3V0LnB1c2goYXggKyAoeSAtIGF5KSAqIChieCAtIGF4KSAvIChieSAtIGF5KSk7XG4gICAgb3V0LnB1c2goeSk7XG4gICAgb3V0LnB1c2goMSk7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gY29udmVydDtcblxudmFyIHNpbXBsaWZ5ID0gcmVxdWlyZSgnLi9zaW1wbGlmeScpO1xudmFyIGNyZWF0ZUZlYXR1cmUgPSByZXF1aXJlKCcuL2ZlYXR1cmUnKTtcblxuLy8gY29udmVydHMgR2VvSlNPTiBmZWF0dXJlIGludG8gYW4gaW50ZXJtZWRpYXRlIHByb2plY3RlZCBKU09OIHZlY3RvciBmb3JtYXQgd2l0aCBzaW1wbGlmaWNhdGlvbiBkYXRhXG5cbmZ1bmN0aW9uIGNvbnZlcnQoZGF0YSwgdG9sZXJhbmNlKSB7XG4gICAgdmFyIGZlYXR1cmVzID0gW107XG5cbiAgICBpZiAoZGF0YS50eXBlID09PSAnRmVhdHVyZUNvbGxlY3Rpb24nKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YS5mZWF0dXJlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29udmVydEZlYXR1cmUoZmVhdHVyZXMsIGRhdGEuZmVhdHVyZXNbaV0sIHRvbGVyYW5jZSk7XG4gICAgICAgIH1cblxuICAgIH0gZWxzZSBpZiAoZGF0YS50eXBlID09PSAnRmVhdHVyZScpIHtcbiAgICAgICAgY29udmVydEZlYXR1cmUoZmVhdHVyZXMsIGRhdGEsIHRvbGVyYW5jZSk7XG5cbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzaW5nbGUgZ2VvbWV0cnkgb3IgYSBnZW9tZXRyeSBjb2xsZWN0aW9uXG4gICAgICAgIGNvbnZlcnRGZWF0dXJlKGZlYXR1cmVzLCB7Z2VvbWV0cnk6IGRhdGF9LCB0b2xlcmFuY2UpO1xuICAgIH1cblxuICAgIHJldHVybiBmZWF0dXJlcztcbn1cblxuZnVuY3Rpb24gY29udmVydEZlYXR1cmUoZmVhdHVyZXMsIGdlb2pzb24sIHRvbGVyYW5jZSkge1xuICAgIGlmICghZ2VvanNvbi5nZW9tZXRyeSkgcmV0dXJuO1xuXG4gICAgdmFyIGNvb3JkcyA9IGdlb2pzb24uZ2VvbWV0cnkuY29vcmRpbmF0ZXM7XG4gICAgdmFyIHR5cGUgPSBnZW9qc29uLmdlb21ldHJ5LnR5cGU7XG4gICAgdmFyIHRvbCA9IHRvbGVyYW5jZSAqIHRvbGVyYW5jZTtcbiAgICB2YXIgZ2VvbWV0cnkgPSBbXTtcblxuICAgIGlmICh0eXBlID09PSAnUG9pbnQnKSB7XG4gICAgICAgIGNvbnZlcnRQb2ludChjb29yZHMsIGdlb21ldHJ5KTtcblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ011bHRpUG9pbnQnKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY29vcmRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb252ZXJ0UG9pbnQoY29vcmRzW2ldLCBnZW9tZXRyeSk7XG4gICAgICAgIH1cblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ0xpbmVTdHJpbmcnKSB7XG4gICAgICAgIGNvbnZlcnRMaW5lKGNvb3JkcywgZ2VvbWV0cnksIHRvbCwgZmFsc2UpO1xuXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnTXVsdGlMaW5lU3RyaW5nJykge1xuICAgICAgICBjb252ZXJ0TGluZXMoY29vcmRzLCBnZW9tZXRyeSwgdG9sLCBmYWxzZSk7XG5cbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBjb252ZXJ0TGluZXMoY29vcmRzLCBnZW9tZXRyeSwgdG9sLCB0cnVlKTtcblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ011bHRpUG9seWdvbicpIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvb3Jkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIHBvbHlnb24gPSBbXTtcbiAgICAgICAgICAgIGNvbnZlcnRMaW5lcyhjb29yZHNbaV0sIHBvbHlnb24sIHRvbCwgdHJ1ZSk7XG4gICAgICAgICAgICBnZW9tZXRyeS5wdXNoKHBvbHlnb24pO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnR2VvbWV0cnlDb2xsZWN0aW9uJykge1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZ2VvanNvbi5nZW9tZXRyeS5nZW9tZXRyaWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb252ZXJ0RmVhdHVyZShmZWF0dXJlcywge1xuICAgICAgICAgICAgICAgIGdlb21ldHJ5OiBnZW9qc29uLmdlb21ldHJ5Lmdlb21ldHJpZXNbaV0sXG4gICAgICAgICAgICAgICAgcHJvcGVydGllczogZ2VvanNvbi5wcm9wZXJ0aWVzXG4gICAgICAgICAgICB9LCB0b2xlcmFuY2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IGRhdGEgaXMgbm90IGEgdmFsaWQgR2VvSlNPTiBvYmplY3QuJyk7XG4gICAgfVxuXG4gICAgZmVhdHVyZXMucHVzaChjcmVhdGVGZWF0dXJlKGdlb2pzb24uaWQsIHR5cGUsIGdlb21ldHJ5LCBnZW9qc29uLnByb3BlcnRpZXMpKTtcbn1cblxuZnVuY3Rpb24gY29udmVydFBvaW50KGNvb3Jkcywgb3V0KSB7XG4gICAgb3V0LnB1c2gocHJvamVjdFgoY29vcmRzWzBdKSk7XG4gICAgb3V0LnB1c2gocHJvamVjdFkoY29vcmRzWzFdKSk7XG4gICAgb3V0LnB1c2goMCk7XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRMaW5lKHJpbmcsIG91dCwgdG9sLCBpc1BvbHlnb24pIHtcbiAgICB2YXIgeDAsIHkwO1xuICAgIHZhciBzaXplID0gMDtcblxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgcmluZy5sZW5ndGg7IGorKykge1xuICAgICAgICB2YXIgeCA9IHByb2plY3RYKHJpbmdbal1bMF0pO1xuICAgICAgICB2YXIgeSA9IHByb2plY3RZKHJpbmdbal1bMV0pO1xuXG4gICAgICAgIG91dC5wdXNoKHgpO1xuICAgICAgICBvdXQucHVzaCh5KTtcbiAgICAgICAgb3V0LnB1c2goMCk7XG5cbiAgICAgICAgaWYgKGogPiAwKSB7XG4gICAgICAgICAgICBpZiAoaXNQb2x5Z29uKSB7XG4gICAgICAgICAgICAgICAgc2l6ZSArPSAoeDAgKiB5IC0geCAqIHkwKSAvIDI7IC8vIGFyZWFcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2l6ZSArPSBNYXRoLnNxcnQoTWF0aC5wb3coeCAtIHgwLCAyKSArIE1hdGgucG93KHkgLSB5MCwgMikpOyAvLyBsZW5ndGhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB4MCA9IHg7XG4gICAgICAgIHkwID0geTtcbiAgICB9XG5cbiAgICB2YXIgbGFzdCA9IG91dC5sZW5ndGggLSAzO1xuICAgIG91dFsyXSA9IDE7XG4gICAgc2ltcGxpZnkob3V0LCAwLCBsYXN0LCB0b2wpO1xuICAgIG91dFtsYXN0ICsgMl0gPSAxO1xuXG4gICAgb3V0LnNpemUgPSBNYXRoLmFicyhzaXplKTtcbn1cblxuZnVuY3Rpb24gY29udmVydExpbmVzKHJpbmdzLCBvdXQsIHRvbCwgaXNQb2x5Z29uKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByaW5ncy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgZ2VvbSA9IFtdO1xuICAgICAgICBjb252ZXJ0TGluZShyaW5nc1tpXSwgZ2VvbSwgdG9sLCBpc1BvbHlnb24pO1xuICAgICAgICBvdXQucHVzaChnZW9tKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHByb2plY3RYKHgpIHtcbiAgICByZXR1cm4geCAvIDM2MCArIDAuNTtcbn1cblxuZnVuY3Rpb24gcHJvamVjdFkoeSkge1xuICAgIHZhciBzaW4gPSBNYXRoLnNpbih5ICogTWF0aC5QSSAvIDE4MCk7XG4gICAgdmFyIHkyID0gMC41IC0gMC4yNSAqIE1hdGgubG9nKCgxICsgc2luKSAvICgxIC0gc2luKSkgLyBNYXRoLlBJO1xuICAgIHJldHVybiB5MiA8IDAgPyAwIDogeTIgPiAxID8gMSA6IHkyO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUZlYXR1cmU7XG5cbmZ1bmN0aW9uIGNyZWF0ZUZlYXR1cmUoaWQsIHR5cGUsIGdlb20sIHRhZ3MpIHtcbiAgICB2YXIgZmVhdHVyZSA9IHtcbiAgICAgICAgaWQ6IGlkIHx8IG51bGwsXG4gICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgIGdlb21ldHJ5OiBnZW9tLFxuICAgICAgICB0YWdzOiB0YWdzLFxuICAgICAgICBtaW5YOiBJbmZpbml0eSxcbiAgICAgICAgbWluWTogSW5maW5pdHksXG4gICAgICAgIG1heFg6IC1JbmZpbml0eSxcbiAgICAgICAgbWF4WTogLUluZmluaXR5XG4gICAgfTtcbiAgICBjYWxjQkJveChmZWF0dXJlKTtcbiAgICByZXR1cm4gZmVhdHVyZTtcbn1cblxuZnVuY3Rpb24gY2FsY0JCb3goZmVhdHVyZSkge1xuICAgIHZhciBnZW9tID0gZmVhdHVyZS5nZW9tZXRyeTtcbiAgICB2YXIgdHlwZSA9IGZlYXR1cmUudHlwZTtcblxuICAgIGlmICh0eXBlID09PSAnUG9pbnQnIHx8IHR5cGUgPT09ICdNdWx0aVBvaW50JyB8fCB0eXBlID09PSAnTGluZVN0cmluZycpIHtcbiAgICAgICAgY2FsY0xpbmVCQm94KGZlYXR1cmUsIGdlb20pO1xuXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnUG9seWdvbicgfHwgdHlwZSA9PT0gJ011bHRpTGluZVN0cmluZycpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnZW9tLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjYWxjTGluZUJCb3goZmVhdHVyZSwgZ2VvbVtpXSk7XG4gICAgICAgIH1cblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ011bHRpUG9seWdvbicpIHtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGdlb20ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZ2VvbVtpXS5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIGNhbGNMaW5lQkJveChmZWF0dXJlLCBnZW9tW2ldW2pdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gY2FsY0xpbmVCQm94KGZlYXR1cmUsIGdlb20pIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGdlb20ubGVuZ3RoOyBpICs9IDMpIHtcbiAgICAgICAgZmVhdHVyZS5taW5YID0gTWF0aC5taW4oZmVhdHVyZS5taW5YLCBnZW9tW2ldKTtcbiAgICAgICAgZmVhdHVyZS5taW5ZID0gTWF0aC5taW4oZmVhdHVyZS5taW5ZLCBnZW9tW2kgKyAxXSk7XG4gICAgICAgIGZlYXR1cmUubWF4WCA9IE1hdGgubWF4KGZlYXR1cmUubWF4WCwgZ2VvbVtpXSk7XG4gICAgICAgIGZlYXR1cmUubWF4WSA9IE1hdGgubWF4KGZlYXR1cmUubWF4WSwgZ2VvbVtpICsgMV0pO1xuICAgIH1cbn1cbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBnZW9qc29udnQ7XG5cbnZhciBjb252ZXJ0ID0gcmVxdWlyZSgnLi9jb252ZXJ0JyksICAgICAvLyBHZW9KU09OIGNvbnZlcnNpb24gYW5kIHByZXByb2Nlc3NpbmdcbiAgICB0cmFuc2Zvcm0gPSByZXF1aXJlKCcuL3RyYW5zZm9ybScpLCAvLyBjb29yZGluYXRlIHRyYW5zZm9ybWF0aW9uXG4gICAgY2xpcCA9IHJlcXVpcmUoJy4vY2xpcCcpLCAgICAgICAgICAgLy8gc3RyaXBlIGNsaXBwaW5nIGFsZ29yaXRobVxuICAgIHdyYXAgPSByZXF1aXJlKCcuL3dyYXAnKSwgICAgICAgICAgIC8vIGRhdGUgbGluZSBwcm9jZXNzaW5nXG4gICAgY3JlYXRlVGlsZSA9IHJlcXVpcmUoJy4vdGlsZScpOyAgICAgLy8gZmluYWwgc2ltcGxpZmllZCB0aWxlIGdlbmVyYXRpb25cblxuXG5mdW5jdGlvbiBnZW9qc29udnQoZGF0YSwgb3B0aW9ucykge1xuICAgIHJldHVybiBuZXcgR2VvSlNPTlZUKGRhdGEsIG9wdGlvbnMpO1xufVxuXG5mdW5jdGlvbiBHZW9KU09OVlQoZGF0YSwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnMgPSBleHRlbmQoT2JqZWN0LmNyZWF0ZSh0aGlzLm9wdGlvbnMpLCBvcHRpb25zKTtcblxuICAgIHZhciBkZWJ1ZyA9IG9wdGlvbnMuZGVidWc7XG5cbiAgICBpZiAoZGVidWcpIGNvbnNvbGUudGltZSgncHJlcHJvY2VzcyBkYXRhJyk7XG5cbiAgICBpZiAob3B0aW9ucy5tYXhab29tIDwgMCB8fCBvcHRpb25zLm1heFpvb20gPiAyNCkgdGhyb3cgbmV3IEVycm9yKCdtYXhab29tIHNob3VsZCBiZSBpbiB0aGUgMC0yNCByYW5nZScpO1xuXG4gICAgdmFyIHoyID0gMSA8PCBvcHRpb25zLm1heFpvb20sIC8vIDJeelxuICAgICAgICBmZWF0dXJlcyA9IGNvbnZlcnQoZGF0YSwgb3B0aW9ucy50b2xlcmFuY2UgLyAoejIgKiBvcHRpb25zLmV4dGVudCkpO1xuXG4gICAgdGhpcy50aWxlcyA9IHt9O1xuICAgIHRoaXMudGlsZUNvb3JkcyA9IFtdO1xuXG4gICAgaWYgKGRlYnVnKSB7XG4gICAgICAgIGNvbnNvbGUudGltZUVuZCgncHJlcHJvY2VzcyBkYXRhJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdpbmRleDogbWF4Wm9vbTogJWQsIG1heFBvaW50czogJWQnLCBvcHRpb25zLmluZGV4TWF4Wm9vbSwgb3B0aW9ucy5pbmRleE1heFBvaW50cyk7XG4gICAgICAgIGNvbnNvbGUudGltZSgnZ2VuZXJhdGUgdGlsZXMnKTtcbiAgICAgICAgdGhpcy5zdGF0cyA9IHt9O1xuICAgICAgICB0aGlzLnRvdGFsID0gMDtcbiAgICB9XG5cbiAgICBmZWF0dXJlcyA9IHdyYXAoZmVhdHVyZXMsIG9wdGlvbnMuYnVmZmVyIC8gb3B0aW9ucy5leHRlbnQpO1xuXG4gICAgLy8gc3RhcnQgc2xpY2luZyBmcm9tIHRoZSB0b3AgdGlsZSBkb3duXG4gICAgaWYgKGZlYXR1cmVzLmxlbmd0aCkgdGhpcy5zcGxpdFRpbGUoZmVhdHVyZXMsIDAsIDAsIDApO1xuXG4gICAgaWYgKGRlYnVnKSB7XG4gICAgICAgIGlmIChmZWF0dXJlcy5sZW5ndGgpIGNvbnNvbGUubG9nKCdmZWF0dXJlczogJWQsIHBvaW50czogJWQnLCB0aGlzLnRpbGVzWzBdLm51bUZlYXR1cmVzLCB0aGlzLnRpbGVzWzBdLm51bVBvaW50cyk7XG4gICAgICAgIGNvbnNvbGUudGltZUVuZCgnZ2VuZXJhdGUgdGlsZXMnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ3RpbGVzIGdlbmVyYXRlZDonLCB0aGlzLnRvdGFsLCBKU09OLnN0cmluZ2lmeSh0aGlzLnN0YXRzKSk7XG4gICAgfVxufVxuXG5HZW9KU09OVlQucHJvdG90eXBlLm9wdGlvbnMgPSB7XG4gICAgbWF4Wm9vbTogMTQsICAgICAgICAgICAgLy8gbWF4IHpvb20gdG8gcHJlc2VydmUgZGV0YWlsIG9uXG4gICAgaW5kZXhNYXhab29tOiA1LCAgICAgICAgLy8gbWF4IHpvb20gaW4gdGhlIHRpbGUgaW5kZXhcbiAgICBpbmRleE1heFBvaW50czogMTAwMDAwLCAvLyBtYXggbnVtYmVyIG9mIHBvaW50cyBwZXIgdGlsZSBpbiB0aGUgdGlsZSBpbmRleFxuICAgIHRvbGVyYW5jZTogMywgICAgICAgICAgIC8vIHNpbXBsaWZpY2F0aW9uIHRvbGVyYW5jZSAoaGlnaGVyIG1lYW5zIHNpbXBsZXIpXG4gICAgZXh0ZW50OiA0MDk2LCAgICAgICAgICAgLy8gdGlsZSBleHRlbnRcbiAgICBidWZmZXI6IDY0LCAgICAgICAgICAgICAvLyB0aWxlIGJ1ZmZlciBvbiBlYWNoIHNpZGVcbiAgICBkZWJ1ZzogMCAgICAgICAgICAgICAgICAvLyBsb2dnaW5nIGxldmVsICgwLCAxIG9yIDIpXG59O1xuXG5HZW9KU09OVlQucHJvdG90eXBlLnNwbGl0VGlsZSA9IGZ1bmN0aW9uIChmZWF0dXJlcywgeiwgeCwgeSwgY3osIGN4LCBjeSkge1xuXG4gICAgdmFyIHN0YWNrID0gW2ZlYXR1cmVzLCB6LCB4LCB5XSxcbiAgICAgICAgb3B0aW9ucyA9IHRoaXMub3B0aW9ucyxcbiAgICAgICAgZGVidWcgPSBvcHRpb25zLmRlYnVnO1xuXG4gICAgLy8gYXZvaWQgcmVjdXJzaW9uIGJ5IHVzaW5nIGEgcHJvY2Vzc2luZyBxdWV1ZVxuICAgIHdoaWxlIChzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgeSA9IHN0YWNrLnBvcCgpO1xuICAgICAgICB4ID0gc3RhY2sucG9wKCk7XG4gICAgICAgIHogPSBzdGFjay5wb3AoKTtcbiAgICAgICAgZmVhdHVyZXMgPSBzdGFjay5wb3AoKTtcblxuICAgICAgICB2YXIgejIgPSAxIDw8IHosXG4gICAgICAgICAgICBpZCA9IHRvSUQoeiwgeCwgeSksXG4gICAgICAgICAgICB0aWxlID0gdGhpcy50aWxlc1tpZF0sXG4gICAgICAgICAgICB0aWxlVG9sZXJhbmNlID0geiA9PT0gb3B0aW9ucy5tYXhab29tID8gMCA6IG9wdGlvbnMudG9sZXJhbmNlIC8gKHoyICogb3B0aW9ucy5leHRlbnQpO1xuXG4gICAgICAgIGlmICghdGlsZSkge1xuICAgICAgICAgICAgaWYgKGRlYnVnID4gMSkgY29uc29sZS50aW1lKCdjcmVhdGlvbicpO1xuXG4gICAgICAgICAgICB0aWxlID0gdGhpcy50aWxlc1tpZF0gPSBjcmVhdGVUaWxlKGZlYXR1cmVzLCB6MiwgeCwgeSwgdGlsZVRvbGVyYW5jZSwgeiA9PT0gb3B0aW9ucy5tYXhab29tKTtcbiAgICAgICAgICAgIHRoaXMudGlsZUNvb3Jkcy5wdXNoKHt6OiB6LCB4OiB4LCB5OiB5fSk7XG5cbiAgICAgICAgICAgIGlmIChkZWJ1Zykge1xuICAgICAgICAgICAgICAgIGlmIChkZWJ1ZyA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ3RpbGUgeiVkLSVkLSVkIChmZWF0dXJlczogJWQsIHBvaW50czogJWQsIHNpbXBsaWZpZWQ6ICVkKScsXG4gICAgICAgICAgICAgICAgICAgICAgICB6LCB4LCB5LCB0aWxlLm51bUZlYXR1cmVzLCB0aWxlLm51bVBvaW50cywgdGlsZS5udW1TaW1wbGlmaWVkKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS50aW1lRW5kKCdjcmVhdGlvbicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gJ3onICsgejtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRzW2tleV0gPSAodGhpcy5zdGF0c1trZXldIHx8IDApICsgMTtcbiAgICAgICAgICAgICAgICB0aGlzLnRvdGFsKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBnZW9tZXRyeSBpbiB0aWxlIHNvIHRoYXQgd2UgY2FuIGRyaWxsIGRvd24gbGF0ZXIgaWYgd2Ugc3RvcCBub3dcbiAgICAgICAgdGlsZS5zb3VyY2UgPSBmZWF0dXJlcztcblxuICAgICAgICAvLyBpZiBpdCdzIHRoZSBmaXJzdC1wYXNzIHRpbGluZ1xuICAgICAgICBpZiAoIWN6KSB7XG4gICAgICAgICAgICAvLyBzdG9wIHRpbGluZyBpZiB3ZSByZWFjaGVkIG1heCB6b29tLCBvciBpZiB0aGUgdGlsZSBpcyB0b28gc2ltcGxlXG4gICAgICAgICAgICBpZiAoeiA9PT0gb3B0aW9ucy5pbmRleE1heFpvb20gfHwgdGlsZS5udW1Qb2ludHMgPD0gb3B0aW9ucy5pbmRleE1heFBvaW50cykgY29udGludWU7XG5cbiAgICAgICAgLy8gaWYgYSBkcmlsbGRvd24gdG8gYSBzcGVjaWZpYyB0aWxlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBzdG9wIHRpbGluZyBpZiB3ZSByZWFjaGVkIGJhc2Ugem9vbSBvciBvdXIgdGFyZ2V0IHRpbGUgem9vbVxuICAgICAgICAgICAgaWYgKHogPT09IG9wdGlvbnMubWF4Wm9vbSB8fCB6ID09PSBjeikgY29udGludWU7XG5cbiAgICAgICAgICAgIC8vIHN0b3AgdGlsaW5nIGlmIGl0J3Mgbm90IGFuIGFuY2VzdG9yIG9mIHRoZSB0YXJnZXQgdGlsZVxuICAgICAgICAgICAgdmFyIG0gPSAxIDw8IChjeiAtIHopO1xuICAgICAgICAgICAgaWYgKHggIT09IE1hdGguZmxvb3IoY3ggLyBtKSB8fCB5ICE9PSBNYXRoLmZsb29yKGN5IC8gbSkpIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgd2Ugc2xpY2UgZnVydGhlciBkb3duLCBubyBuZWVkIHRvIGtlZXAgc291cmNlIGdlb21ldHJ5XG4gICAgICAgIHRpbGUuc291cmNlID0gbnVsbDtcblxuICAgICAgICBpZiAoZmVhdHVyZXMubGVuZ3RoID09PSAwKSBjb250aW51ZTtcblxuICAgICAgICBpZiAoZGVidWcgPiAxKSBjb25zb2xlLnRpbWUoJ2NsaXBwaW5nJyk7XG5cbiAgICAgICAgLy8gdmFsdWVzIHdlJ2xsIHVzZSBmb3IgY2xpcHBpbmdcbiAgICAgICAgdmFyIGsxID0gMC41ICogb3B0aW9ucy5idWZmZXIgLyBvcHRpb25zLmV4dGVudCxcbiAgICAgICAgICAgIGsyID0gMC41IC0gazEsXG4gICAgICAgICAgICBrMyA9IDAuNSArIGsxLFxuICAgICAgICAgICAgazQgPSAxICsgazEsXG4gICAgICAgICAgICB0bCwgYmwsIHRyLCBiciwgbGVmdCwgcmlnaHQ7XG5cbiAgICAgICAgdGwgPSBibCA9IHRyID0gYnIgPSBudWxsO1xuXG4gICAgICAgIGxlZnQgID0gY2xpcChmZWF0dXJlcywgejIsIHggLSBrMSwgeCArIGszLCAwLCB0aWxlLm1pblgsIHRpbGUubWF4WCk7XG4gICAgICAgIHJpZ2h0ID0gY2xpcChmZWF0dXJlcywgejIsIHggKyBrMiwgeCArIGs0LCAwLCB0aWxlLm1pblgsIHRpbGUubWF4WCk7XG4gICAgICAgIGZlYXR1cmVzID0gbnVsbDtcblxuICAgICAgICBpZiAobGVmdCkge1xuICAgICAgICAgICAgdGwgPSBjbGlwKGxlZnQsIHoyLCB5IC0gazEsIHkgKyBrMywgMSwgdGlsZS5taW5ZLCB0aWxlLm1heFkpO1xuICAgICAgICAgICAgYmwgPSBjbGlwKGxlZnQsIHoyLCB5ICsgazIsIHkgKyBrNCwgMSwgdGlsZS5taW5ZLCB0aWxlLm1heFkpO1xuICAgICAgICAgICAgbGVmdCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmlnaHQpIHtcbiAgICAgICAgICAgIHRyID0gY2xpcChyaWdodCwgejIsIHkgLSBrMSwgeSArIGszLCAxLCB0aWxlLm1pblksIHRpbGUubWF4WSk7XG4gICAgICAgICAgICBiciA9IGNsaXAocmlnaHQsIHoyLCB5ICsgazIsIHkgKyBrNCwgMSwgdGlsZS5taW5ZLCB0aWxlLm1heFkpO1xuICAgICAgICAgICAgcmlnaHQgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRlYnVnID4gMSkgY29uc29sZS50aW1lRW5kKCdjbGlwcGluZycpO1xuXG4gICAgICAgIHN0YWNrLnB1c2godGwgfHwgW10sIHogKyAxLCB4ICogMiwgICAgIHkgKiAyKTtcbiAgICAgICAgc3RhY2sucHVzaChibCB8fCBbXSwgeiArIDEsIHggKiAyLCAgICAgeSAqIDIgKyAxKTtcbiAgICAgICAgc3RhY2sucHVzaCh0ciB8fCBbXSwgeiArIDEsIHggKiAyICsgMSwgeSAqIDIpO1xuICAgICAgICBzdGFjay5wdXNoKGJyIHx8IFtdLCB6ICsgMSwgeCAqIDIgKyAxLCB5ICogMiArIDEpO1xuICAgIH1cbn07XG5cbkdlb0pTT05WVC5wcm90b3R5cGUuZ2V0VGlsZSA9IGZ1bmN0aW9uICh6LCB4LCB5KSB7XG4gICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnMsXG4gICAgICAgIGV4dGVudCA9IG9wdGlvbnMuZXh0ZW50LFxuICAgICAgICBkZWJ1ZyA9IG9wdGlvbnMuZGVidWc7XG5cbiAgICBpZiAoeiA8IDAgfHwgeiA+IDI0KSByZXR1cm4gbnVsbDtcblxuICAgIHZhciB6MiA9IDEgPDwgejtcbiAgICB4ID0gKCh4ICUgejIpICsgejIpICUgejI7IC8vIHdyYXAgdGlsZSB4IGNvb3JkaW5hdGVcblxuICAgIHZhciBpZCA9IHRvSUQoeiwgeCwgeSk7XG4gICAgaWYgKHRoaXMudGlsZXNbaWRdKSByZXR1cm4gdHJhbnNmb3JtLnRpbGUodGhpcy50aWxlc1tpZF0sIGV4dGVudCk7XG5cbiAgICBpZiAoZGVidWcgPiAxKSBjb25zb2xlLmxvZygnZHJpbGxpbmcgZG93biB0byB6JWQtJWQtJWQnLCB6LCB4LCB5KTtcblxuICAgIHZhciB6MCA9IHosXG4gICAgICAgIHgwID0geCxcbiAgICAgICAgeTAgPSB5LFxuICAgICAgICBwYXJlbnQ7XG5cbiAgICB3aGlsZSAoIXBhcmVudCAmJiB6MCA+IDApIHtcbiAgICAgICAgejAtLTtcbiAgICAgICAgeDAgPSBNYXRoLmZsb29yKHgwIC8gMik7XG4gICAgICAgIHkwID0gTWF0aC5mbG9vcih5MCAvIDIpO1xuICAgICAgICBwYXJlbnQgPSB0aGlzLnRpbGVzW3RvSUQoejAsIHgwLCB5MCldO1xuICAgIH1cblxuICAgIGlmICghcGFyZW50IHx8ICFwYXJlbnQuc291cmNlKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGlmIHdlIGZvdW5kIGEgcGFyZW50IHRpbGUgY29udGFpbmluZyB0aGUgb3JpZ2luYWwgZ2VvbWV0cnksIHdlIGNhbiBkcmlsbCBkb3duIGZyb20gaXRcbiAgICBpZiAoZGVidWcgPiAxKSBjb25zb2xlLmxvZygnZm91bmQgcGFyZW50IHRpbGUgeiVkLSVkLSVkJywgejAsIHgwLCB5MCk7XG5cbiAgICBpZiAoZGVidWcgPiAxKSBjb25zb2xlLnRpbWUoJ2RyaWxsaW5nIGRvd24nKTtcbiAgICB0aGlzLnNwbGl0VGlsZShwYXJlbnQuc291cmNlLCB6MCwgeDAsIHkwLCB6LCB4LCB5KTtcbiAgICBpZiAoZGVidWcgPiAxKSBjb25zb2xlLnRpbWVFbmQoJ2RyaWxsaW5nIGRvd24nKTtcblxuICAgIHJldHVybiB0aGlzLnRpbGVzW2lkXSA/IHRyYW5zZm9ybS50aWxlKHRoaXMudGlsZXNbaWRdLCBleHRlbnQpIDogbnVsbDtcbn07XG5cbmZ1bmN0aW9uIHRvSUQoeiwgeCwgeSkge1xuICAgIHJldHVybiAoKCgxIDw8IHopICogeSArIHgpICogMzIpICsgejtcbn1cblxuZnVuY3Rpb24gZXh0ZW5kKGRlc3QsIHNyYykge1xuICAgIGZvciAodmFyIGkgaW4gc3JjKSBkZXN0W2ldID0gc3JjW2ldO1xuICAgIHJldHVybiBkZXN0O1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHNpbXBsaWZ5O1xuXG4vLyBjYWxjdWxhdGUgc2ltcGxpZmljYXRpb24gZGF0YSB1c2luZyBvcHRpbWl6ZWQgRG91Z2xhcy1QZXVja2VyIGFsZ29yaXRobVxuXG5mdW5jdGlvbiBzaW1wbGlmeShjb29yZHMsIGZpcnN0LCBsYXN0LCBzcVRvbGVyYW5jZSkge1xuICAgIHZhciBtYXhTcURpc3QgPSBzcVRvbGVyYW5jZTtcbiAgICB2YXIgaW5kZXg7XG5cbiAgICB2YXIgYXggPSBjb29yZHNbZmlyc3RdO1xuICAgIHZhciBheSA9IGNvb3Jkc1tmaXJzdCArIDFdO1xuICAgIHZhciBieCA9IGNvb3Jkc1tsYXN0XTtcbiAgICB2YXIgYnkgPSBjb29yZHNbbGFzdCArIDFdO1xuXG4gICAgZm9yICh2YXIgaSA9IGZpcnN0ICsgMzsgaSA8IGxhc3Q7IGkgKz0gMykge1xuICAgICAgICB2YXIgZCA9IGdldFNxU2VnRGlzdChjb29yZHNbaV0sIGNvb3Jkc1tpICsgMV0sIGF4LCBheSwgYngsIGJ5KTtcbiAgICAgICAgaWYgKGQgPiBtYXhTcURpc3QpIHtcbiAgICAgICAgICAgIGluZGV4ID0gaTtcbiAgICAgICAgICAgIG1heFNxRGlzdCA9IGQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWF4U3FEaXN0ID4gc3FUb2xlcmFuY2UpIHtcbiAgICAgICAgaWYgKGluZGV4IC0gZmlyc3QgPiAzKSBzaW1wbGlmeShjb29yZHMsIGZpcnN0LCBpbmRleCwgc3FUb2xlcmFuY2UpO1xuICAgICAgICBjb29yZHNbaW5kZXggKyAyXSA9IG1heFNxRGlzdDtcbiAgICAgICAgaWYgKGxhc3QgLSBpbmRleCA+IDMpIHNpbXBsaWZ5KGNvb3JkcywgaW5kZXgsIGxhc3QsIHNxVG9sZXJhbmNlKTtcbiAgICB9XG59XG5cbi8vIHNxdWFyZSBkaXN0YW5jZSBmcm9tIGEgcG9pbnQgdG8gYSBzZWdtZW50XG5mdW5jdGlvbiBnZXRTcVNlZ0Rpc3QocHgsIHB5LCB4LCB5LCBieCwgYnkpIHtcblxuICAgIHZhciBkeCA9IGJ4IC0geDtcbiAgICB2YXIgZHkgPSBieSAtIHk7XG5cbiAgICBpZiAoZHggIT09IDAgfHwgZHkgIT09IDApIHtcblxuICAgICAgICB2YXIgdCA9ICgocHggLSB4KSAqIGR4ICsgKHB5IC0geSkgKiBkeSkgLyAoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgICAgIGlmICh0ID4gMSkge1xuICAgICAgICAgICAgeCA9IGJ4O1xuICAgICAgICAgICAgeSA9IGJ5O1xuXG4gICAgICAgIH0gZWxzZSBpZiAodCA+IDApIHtcbiAgICAgICAgICAgIHggKz0gZHggKiB0O1xuICAgICAgICAgICAgeSArPSBkeSAqIHQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkeCA9IHB4IC0geDtcbiAgICBkeSA9IHB5IC0geTtcblxuICAgIHJldHVybiBkeCAqIGR4ICsgZHkgKiBkeTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVUaWxlO1xuXG5mdW5jdGlvbiBjcmVhdGVUaWxlKGZlYXR1cmVzLCB6MiwgdHgsIHR5LCB0b2xlcmFuY2UsIG5vU2ltcGxpZnkpIHtcbiAgICB2YXIgdGlsZSA9IHtcbiAgICAgICAgZmVhdHVyZXM6IFtdLFxuICAgICAgICBudW1Qb2ludHM6IDAsXG4gICAgICAgIG51bVNpbXBsaWZpZWQ6IDAsXG4gICAgICAgIG51bUZlYXR1cmVzOiAwLFxuICAgICAgICBzb3VyY2U6IG51bGwsXG4gICAgICAgIHg6IHR4LFxuICAgICAgICB5OiB0eSxcbiAgICAgICAgejI6IHoyLFxuICAgICAgICB0cmFuc2Zvcm1lZDogZmFsc2UsXG4gICAgICAgIG1pblg6IDIsXG4gICAgICAgIG1pblk6IDEsXG4gICAgICAgIG1heFg6IC0xLFxuICAgICAgICBtYXhZOiAwXG4gICAgfTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZlYXR1cmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHRpbGUubnVtRmVhdHVyZXMrKztcbiAgICAgICAgYWRkRmVhdHVyZSh0aWxlLCBmZWF0dXJlc1tpXSwgdG9sZXJhbmNlLCBub1NpbXBsaWZ5KTtcblxuICAgICAgICB2YXIgbWluWCA9IGZlYXR1cmVzW2ldLm1pblg7XG4gICAgICAgIHZhciBtaW5ZID0gZmVhdHVyZXNbaV0ubWluWTtcbiAgICAgICAgdmFyIG1heFggPSBmZWF0dXJlc1tpXS5tYXhYO1xuICAgICAgICB2YXIgbWF4WSA9IGZlYXR1cmVzW2ldLm1heFk7XG5cbiAgICAgICAgaWYgKG1pblggPCB0aWxlLm1pblgpIHRpbGUubWluWCA9IG1pblg7XG4gICAgICAgIGlmIChtaW5ZIDwgdGlsZS5taW5ZKSB0aWxlLm1pblkgPSBtaW5ZO1xuICAgICAgICBpZiAobWF4WCA+IHRpbGUubWF4WCkgdGlsZS5tYXhYID0gbWF4WDtcbiAgICAgICAgaWYgKG1heFkgPiB0aWxlLm1heFkpIHRpbGUubWF4WSA9IG1heFk7XG4gICAgfVxuICAgIHJldHVybiB0aWxlO1xufVxuXG5mdW5jdGlvbiBhZGRGZWF0dXJlKHRpbGUsIGZlYXR1cmUsIHRvbGVyYW5jZSwgbm9TaW1wbGlmeSkge1xuXG4gICAgdmFyIGdlb20gPSBmZWF0dXJlLmdlb21ldHJ5LFxuICAgICAgICB0eXBlID0gZmVhdHVyZS50eXBlLFxuICAgICAgICBzaW1wbGlmaWVkID0gW107XG5cbiAgICBpZiAodHlwZSA9PT0gJ1BvaW50JyB8fCB0eXBlID09PSAnTXVsdGlQb2ludCcpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBnZW9tLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgICAgICAgICBzaW1wbGlmaWVkLnB1c2goZ2VvbVtpXSk7XG4gICAgICAgICAgICBzaW1wbGlmaWVkLnB1c2goZ2VvbVtpICsgMV0pO1xuICAgICAgICAgICAgdGlsZS5udW1Qb2ludHMrKztcbiAgICAgICAgICAgIHRpbGUubnVtU2ltcGxpZmllZCsrO1xuICAgICAgICB9XG5cbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdMaW5lU3RyaW5nJykge1xuICAgICAgICBhZGRMaW5lKHNpbXBsaWZpZWQsIGdlb20sIHRpbGUsIHRvbGVyYW5jZSwgbm9TaW1wbGlmeSwgZmFsc2UsIGZhbHNlKTtcblxuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ011bHRpTGluZVN0cmluZycgfHwgdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBnZW9tLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhZGRMaW5lKHNpbXBsaWZpZWQsIGdlb21baV0sIHRpbGUsIHRvbGVyYW5jZSwgbm9TaW1wbGlmeSwgdHlwZSA9PT0gJ1BvbHlnb24nLCBpID09PSAwKTtcbiAgICAgICAgfVxuXG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnTXVsdGlQb2x5Z29uJykge1xuXG4gICAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgZ2VvbS5sZW5ndGg7IGsrKykge1xuICAgICAgICAgICAgdmFyIHBvbHlnb24gPSBnZW9tW2tdO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHBvbHlnb24ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBhZGRMaW5lKHNpbXBsaWZpZWQsIHBvbHlnb25baV0sIHRpbGUsIHRvbGVyYW5jZSwgbm9TaW1wbGlmeSwgdHJ1ZSwgaSA9PT0gMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc2ltcGxpZmllZC5sZW5ndGgpIHtcbiAgICAgICAgdmFyIHRpbGVGZWF0dXJlID0ge1xuICAgICAgICAgICAgZ2VvbWV0cnk6IHNpbXBsaWZpZWQsXG4gICAgICAgICAgICB0eXBlOiB0eXBlID09PSAnUG9seWdvbicgfHwgdHlwZSA9PT0gJ011bHRpUG9seWdvbicgPyAzIDpcbiAgICAgICAgICAgICAgICB0eXBlID09PSAnTGluZVN0cmluZycgfHwgdHlwZSA9PT0gJ011bHRpTGluZVN0cmluZycgPyAyIDogMSxcbiAgICAgICAgICAgIHRhZ3M6IGZlYXR1cmUudGFncyB8fCBudWxsXG4gICAgICAgIH07XG4gICAgICAgIGlmIChmZWF0dXJlLmlkICE9PSBudWxsKSB7XG4gICAgICAgICAgICB0aWxlRmVhdHVyZS5pZCA9IGZlYXR1cmUuaWQ7XG4gICAgICAgIH1cbiAgICAgICAgdGlsZS5mZWF0dXJlcy5wdXNoKHRpbGVGZWF0dXJlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFkZExpbmUocmVzdWx0LCBnZW9tLCB0aWxlLCB0b2xlcmFuY2UsIG5vU2ltcGxpZnksIGlzUG9seWdvbiwgaXNPdXRlcikge1xuICAgIHZhciBzcVRvbGVyYW5jZSA9IHRvbGVyYW5jZSAqIHRvbGVyYW5jZTtcblxuICAgIGlmICghbm9TaW1wbGlmeSAmJiAoZ2VvbS5zaXplIDwgKGlzUG9seWdvbiA/IHNxVG9sZXJhbmNlIDogdG9sZXJhbmNlKSkpIHtcbiAgICAgICAgdGlsZS5udW1Qb2ludHMgKz0gZ2VvbS5sZW5ndGggLyAzO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHJpbmcgPSBbXTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZ2VvbS5sZW5ndGg7IGkgKz0gMykge1xuICAgICAgICBpZiAobm9TaW1wbGlmeSB8fCBnZW9tW2kgKyAyXSA+IHNxVG9sZXJhbmNlKSB7XG4gICAgICAgICAgICB0aWxlLm51bVNpbXBsaWZpZWQrKztcbiAgICAgICAgICAgIHJpbmcucHVzaChnZW9tW2ldKTtcbiAgICAgICAgICAgIHJpbmcucHVzaChnZW9tW2kgKyAxXSk7XG4gICAgICAgIH1cbiAgICAgICAgdGlsZS5udW1Qb2ludHMrKztcbiAgICB9XG5cbiAgICBpZiAoaXNQb2x5Z29uKSByZXdpbmQocmluZywgaXNPdXRlcik7XG5cbiAgICByZXN1bHQucHVzaChyaW5nKTtcbn1cblxuZnVuY3Rpb24gcmV3aW5kKHJpbmcsIGNsb2Nrd2lzZSkge1xuICAgIHZhciBhcmVhID0gMDtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gcmluZy5sZW5ndGgsIGogPSBsZW4gLSAyOyBpIDwgbGVuOyBqID0gaSwgaSArPSAyKSB7XG4gICAgICAgIGFyZWEgKz0gKHJpbmdbaV0gLSByaW5nW2pdKSAqIChyaW5nW2kgKyAxXSArIHJpbmdbaiArIDFdKTtcbiAgICB9XG4gICAgaWYgKGFyZWEgPiAwID09PSBjbG9ja3dpc2UpIHtcbiAgICAgICAgZm9yIChpID0gMCwgbGVuID0gcmluZy5sZW5ndGg7IGkgPCBsZW4gLyAyOyBpICs9IDIpIHtcbiAgICAgICAgICAgIHZhciB4ID0gcmluZ1tpXTtcbiAgICAgICAgICAgIHZhciB5ID0gcmluZ1tpICsgMV07XG4gICAgICAgICAgICByaW5nW2ldID0gcmluZ1tsZW4gLSAyIC0gaV07XG4gICAgICAgICAgICByaW5nW2kgKyAxXSA9IHJpbmdbbGVuIC0gMSAtIGldO1xuICAgICAgICAgICAgcmluZ1tsZW4gLSAyIC0gaV0gPSB4O1xuICAgICAgICAgICAgcmluZ1tsZW4gLSAxIC0gaV0gPSB5O1xuICAgICAgICB9XG4gICAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLnRpbGUgPSB0cmFuc2Zvcm1UaWxlO1xuZXhwb3J0cy5wb2ludCA9IHRyYW5zZm9ybVBvaW50O1xuXG4vLyBUcmFuc2Zvcm1zIHRoZSBjb29yZGluYXRlcyBvZiBlYWNoIGZlYXR1cmUgaW4gdGhlIGdpdmVuIHRpbGUgZnJvbVxuLy8gbWVyY2F0b3ItcHJvamVjdGVkIHNwYWNlIGludG8gKGV4dGVudCB4IGV4dGVudCkgdGlsZSBzcGFjZS5cbmZ1bmN0aW9uIHRyYW5zZm9ybVRpbGUodGlsZSwgZXh0ZW50KSB7XG4gICAgaWYgKHRpbGUudHJhbnNmb3JtZWQpIHJldHVybiB0aWxlO1xuXG4gICAgdmFyIHoyID0gdGlsZS56MixcbiAgICAgICAgdHggPSB0aWxlLngsXG4gICAgICAgIHR5ID0gdGlsZS55LFxuICAgICAgICBpLCBqLCBrO1xuXG4gICAgZm9yIChpID0gMDsgaSA8IHRpbGUuZmVhdHVyZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGZlYXR1cmUgPSB0aWxlLmZlYXR1cmVzW2ldLFxuICAgICAgICAgICAgZ2VvbSA9IGZlYXR1cmUuZ2VvbWV0cnksXG4gICAgICAgICAgICB0eXBlID0gZmVhdHVyZS50eXBlO1xuXG4gICAgICAgIGZlYXR1cmUuZ2VvbWV0cnkgPSBbXTtcblxuICAgICAgICBpZiAodHlwZSA9PT0gMSkge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGdlb20ubGVuZ3RoOyBqICs9IDIpIHtcbiAgICAgICAgICAgICAgICBmZWF0dXJlLmdlb21ldHJ5LnB1c2godHJhbnNmb3JtUG9pbnQoZ2VvbVtqXSwgZ2VvbVtqICsgMV0sIGV4dGVudCwgejIsIHR4LCB0eSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGdlb20ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgcmluZyA9IFtdO1xuICAgICAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBnZW9tW2pdLmxlbmd0aDsgayArPSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJpbmcucHVzaCh0cmFuc2Zvcm1Qb2ludChnZW9tW2pdW2tdLCBnZW9tW2pdW2sgKyAxXSwgZXh0ZW50LCB6MiwgdHgsIHR5KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZlYXR1cmUuZ2VvbWV0cnkucHVzaChyaW5nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRpbGUudHJhbnNmb3JtZWQgPSB0cnVlO1xuXG4gICAgcmV0dXJuIHRpbGU7XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVBvaW50KHgsIHksIGV4dGVudCwgejIsIHR4LCB0eSkge1xuICAgIHJldHVybiBbXG4gICAgICAgIE1hdGgucm91bmQoZXh0ZW50ICogKHggKiB6MiAtIHR4KSksXG4gICAgICAgIE1hdGgucm91bmQoZXh0ZW50ICogKHkgKiB6MiAtIHR5KSldO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2xpcCA9IHJlcXVpcmUoJy4vY2xpcCcpO1xudmFyIGNyZWF0ZUZlYXR1cmUgPSByZXF1aXJlKCcuL2ZlYXR1cmUnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB3cmFwO1xuXG5mdW5jdGlvbiB3cmFwKGZlYXR1cmVzLCBidWZmZXIpIHtcbiAgICB2YXIgbWVyZ2VkID0gZmVhdHVyZXMsXG4gICAgICAgIGxlZnQgID0gY2xpcChmZWF0dXJlcywgMSwgLTEgLSBidWZmZXIsIGJ1ZmZlciwgICAgIDAsIC0xLCAyKSwgLy8gbGVmdCB3b3JsZCBjb3B5XG4gICAgICAgIHJpZ2h0ID0gY2xpcChmZWF0dXJlcywgMSwgIDEgLSBidWZmZXIsIDIgKyBidWZmZXIsIDAsIC0xLCAyKTsgLy8gcmlnaHQgd29ybGQgY29weVxuXG4gICAgaWYgKGxlZnQgfHwgcmlnaHQpIHtcbiAgICAgICAgbWVyZ2VkID0gY2xpcChmZWF0dXJlcywgMSwgLWJ1ZmZlciwgMSArIGJ1ZmZlciwgMCwgLTEsIDIpIHx8IFtdOyAvLyBjZW50ZXIgd29ybGQgY29weVxuXG4gICAgICAgIGlmIChsZWZ0KSBtZXJnZWQgPSBzaGlmdEZlYXR1cmVDb29yZHMobGVmdCwgMSkuY29uY2F0KG1lcmdlZCk7IC8vIG1lcmdlIGxlZnQgaW50byBjZW50ZXJcbiAgICAgICAgaWYgKHJpZ2h0KSBtZXJnZWQgPSBtZXJnZWQuY29uY2F0KHNoaWZ0RmVhdHVyZUNvb3JkcyhyaWdodCwgLTEpKTsgLy8gbWVyZ2UgcmlnaHQgaW50byBjZW50ZXJcbiAgICB9XG5cbiAgICByZXR1cm4gbWVyZ2VkO1xufVxuXG5mdW5jdGlvbiBzaGlmdEZlYXR1cmVDb29yZHMoZmVhdHVyZXMsIG9mZnNldCkge1xuICAgIHZhciBuZXdGZWF0dXJlcyA9IFtdO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmZWF0dXJlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgZmVhdHVyZSA9IGZlYXR1cmVzW2ldLFxuICAgICAgICAgICAgdHlwZSA9IGZlYXR1cmUudHlwZTtcblxuICAgICAgICB2YXIgbmV3R2VvbWV0cnk7XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdQb2ludCcgfHwgdHlwZSA9PT0gJ011bHRpUG9pbnQnIHx8IHR5cGUgPT09ICdMaW5lU3RyaW5nJykge1xuICAgICAgICAgICAgbmV3R2VvbWV0cnkgPSBzaGlmdENvb3JkcyhmZWF0dXJlLmdlb21ldHJ5LCBvZmZzZXQpO1xuXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ011bHRpTGluZVN0cmluZycgfHwgdHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgICAgICBuZXdHZW9tZXRyeSA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmZWF0dXJlLmdlb21ldHJ5Lmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgbmV3R2VvbWV0cnkucHVzaChzaGlmdENvb3JkcyhmZWF0dXJlLmdlb21ldHJ5W2pdLCBvZmZzZXQpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnTXVsdGlQb2x5Z29uJykge1xuICAgICAgICAgICAgbmV3R2VvbWV0cnkgPSBbXTtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBmZWF0dXJlLmdlb21ldHJ5Lmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5ld1BvbHlnb24gPSBbXTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IGZlYXR1cmUuZ2VvbWV0cnlbal0ubGVuZ3RoOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3UG9seWdvbi5wdXNoKHNoaWZ0Q29vcmRzKGZlYXR1cmUuZ2VvbWV0cnlbal1ba10sIG9mZnNldCkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBuZXdHZW9tZXRyeS5wdXNoKG5ld1BvbHlnb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbmV3RmVhdHVyZXMucHVzaChjcmVhdGVGZWF0dXJlKGZlYXR1cmUuaWQsIHR5cGUsIG5ld0dlb21ldHJ5LCBmZWF0dXJlLnRhZ3MpKTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3RmVhdHVyZXM7XG59XG5cbmZ1bmN0aW9uIHNoaWZ0Q29vcmRzKHBvaW50cywgb2Zmc2V0KSB7XG4gICAgdmFyIG5ld1BvaW50cyA9IFtdO1xuICAgIG5ld1BvaW50cy5zaXplID0gcG9pbnRzLnNpemU7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBvaW50cy5sZW5ndGg7IGkgKz0gMykge1xuICAgICAgICBuZXdQb2ludHMucHVzaChwb2ludHNbaV0gKyBvZmZzZXQsIHBvaW50c1tpICsgMV0sIHBvaW50c1tpICsgMl0pO1xuICAgIH1cbiAgICByZXR1cm4gbmV3UG9pbnRzO1xufVxuIl19

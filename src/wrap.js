
import clip from './clip.js';
import {createFeature, createSinglePoint, POINT, SINGLE_POINT} from './feature.js';

/** @import {AnyFeature, CoordArray, CoordArrayCtor, InternalOptions as Options} from './internal.d.ts' */

// All thresholds and feature coords here live in storage space (centered
// Int32 quanta when the gate passed, source [0,1] doubles otherwise). The
// wrap shift (one full world width) is `worldScale` in storage units.

/** @param {AnyFeature[]} features @param {Options} options @returns {AnyFeature[]} */
export default function wrap(features, options) {
    const S = options.worldScale;
    const O = options.originShift;
    // buffer width in storage units
    const buf = options.buffer * S / options.extent;
    // world [0, 1] in storage units: [-O*S, (1-O)*S]
    const w0 = -O * S;
    const w1 = (1 - O) * S;
    let merged = features;
    const left  = clip(features, w0 - S - buf, w0 + buf, 0, w0 - S, w1 + S, options); // left world copy
    const right = clip(features, w1 - buf,     w1 + S + buf, 0, w0 - S, w1 + S, options); // right world copy

    if (left || right) {
        merged = clip(features, w0 - buf, w1 + buf, 0, w0 - S, w1 + S, options) || []; // center world copy

        if (left)  merged = shiftFeatureCoords(left,  S, options).concat(merged); // merge left into center
        if (right) merged = merged.concat(shiftFeatureCoords(right, -S, options)); // merge right into center
    }
    return merged;
}

/** @param {AnyFeature[]} features @param {number} offset @param {Options} options @returns {AnyFeature[]} */
function shiftFeatureCoords(features, offset, options) {
    const out = [];
    for (const feature of features) {
        if (feature.type === SINGLE_POINT) {
            out.push(createSinglePoint(feature.id, feature.x + offset, feature.y, feature.tags));
            continue;
        }
        const newGeom = shiftGeom(feature.geometry, feature.type, offset, options.CoordArray);
        const shifted = createFeature(feature.id, feature.type, newGeom, feature.tags);
        if (feature.start !== undefined) {
            shifted.start = feature.start;
            shifted.end = feature.end;
        }
        out.push(shifted);
    }
    return out;
}

// Build a shifted copy of a feature's geometry — a single new buffer per
// feature (POINT: flat coords; LINE/POLYGON: inline-header rings). Output
// size is identical to input, so we can pre-size exactly.
/** @param {CoordArray} geom @param {1|2|3} type @param {number} offset @param {CoordArrayCtor} CoordArray @returns {CoordArray} */
function shiftGeom(geom, type, offset, CoordArray) {
    const out = new CoordArray(geom.length);
    if (type === POINT) {
        for (let i = 0; i < geom.length; i += 3) {
            out[i]     = geom[i] + offset;
            out[i + 1] = geom[i + 1];
            out[i + 2] = geom[i + 2];
        }
    } else {
        for (let i = 0; i < geom.length;) {
            const ringLen = geom[i];
            out[i]     = ringLen;
            out[i + 1] = geom[i + 1];
            const coordsEnd = i + 2 + ringLen * 3;
            for (let j = i + 2; j < coordsEnd; j += 3) {
                out[j]     = geom[j] + offset;
                out[j + 1] = geom[j + 1];
                out[j + 2] = geom[j + 2];
            }
            i = coordsEnd;
        }
    }
    return out;
}

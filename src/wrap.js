
import clip from './clip.js';
import createFeature, {POINT} from './feature.js';

export default function wrap(features, options) {
    const buffer = options.buffer / options.extent;
    let merged = features;
    const left  = clip(features, 1, -1 - buffer, buffer,     0, -1, 2, options); // left world copy
    const right = clip(features, 1,  1 - buffer, 2 + buffer, 0, -1, 2, options); // right world copy

    if (left || right) {
        merged = clip(features, 1, -buffer, 1 + buffer, 0, -1, 2, options) || []; // center world copy

        if (left)  merged = shiftFeatureCoords(left,  1).concat(merged); // merge left into center
        if (right) merged = merged.concat(shiftFeatureCoords(right, -1)); // merge right into center
    }
    return merged;
}

function shiftFeatureCoords(features, offset) {
    const out = [];
    for (const feature of features) {
        let newGeom;
        if (feature.type === POINT) {
            newGeom = shiftRing(feature.geometry, offset);
        } else {
            newGeom = [];
            for (const ring of feature.geometry) newGeom.push(shiftRing(ring, offset));
        }
        const shifted = createFeature(feature.id, feature.type, newGeom, feature.tags);
        if (feature.start !== undefined) {
            shifted.start = feature.start;
            shifted.end = feature.end;
        }
        out.push(shifted);
    }
    return out;
}

function shiftRing(ring, offset) {
    const out = /** @type {number[] & {size: number}} */ ([]);
    out.size = ring.size;
    for (let i = 0; i < ring.length; i += 3) {
        out.push(ring[i] + offset, ring[i + 1], ring[i + 2]);
    }
    return out;
}

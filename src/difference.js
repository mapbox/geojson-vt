import convert from './convert.js'; // GeoJSON conversion and preprocessing
import wrap from './wrap.js';       // date line processing

// This file provides a set of helper functions for managing "diffs" (changes)
// to GeoJSON data structures. These diffs describe additions, removals,
// and updates of features in a GeoJSON source in an efficient way.

// GeoJSON Source Diff:
// {
//   removeAll: true,                    // If true, clear all existing features
//   remove: [featureId, ...],           // Array of feature IDs to remove
//   add: [feature, ...],                // Array of GeoJSON features to add
//   update: [GeoJSON Feature Diff, ...]   // Array of per-feature updates
// }

// GeoJSON Feature Diff:
// {
//   id: featureId,                       // ID of the feature being updated
//   newGeometry: GeoJSON.Geometry,      // Optional new geometry
//   removeAllProperties: true,          // Remove all properties if true
//   removeProperties: [key, ...],       // Specific properties to delete
//   addOrUpdateProperties: [            // Properties to add or update
//     { key: "name", value: "New name" }
//   ]
// }

/* eslint @stylistic/comma-spacing: 0, no-shadow: 0 */

// applies a diff to the geojsonvt source simplified features array
// returns an object with the affected features and new source array for invalidation
export function applySourceDiff(source, dataDiff, options) {

    // convert diff to sets/maps for o(1) lookups
    const diff = diffToHashed(dataDiff);

    // collection for features that will be affected by this update
    let affected = [];

    // full removal - clear everything before applying diff
    if (diff.removeAll) {
        affected = source;
        source = [];
    }

    // remove/add features and collect affected ones
    if (diff.remove.size || diff.add.size) {
        const removeFeatures = [];

        // collect source features to be removed
        for (const feature of source) {
            const {id} = feature;

            // explicit feature removal
            if (diff.remove.has(id)) {
                removeFeatures.push(feature);
            // feature with duplicate id being added
            } else if (diff.add.has(id)) {
                removeFeatures.push(feature);
            }
        }

        // collect affected and remove from source
        if (removeFeatures.length) {
            affected.push(...removeFeatures);

            const removeIds = new Set(removeFeatures.map(f => f.id));
            source = source.filter(f => !removeIds.has(f.id));
        }

        // convert and add new features
        if (diff.add.size) {
            // projects and adds simplification info
            let addFeatures = convert({type: 'FeatureCollection', features: Array.from(diff.add.values())}, options);

            // wraps features (ie extreme west and extreme east)
            addFeatures = wrap(addFeatures, options);

            affected.push(...addFeatures);
            source.push(...addFeatures);
        }
    }

    if (diff.update.size) {
        for (const [id, update] of diff.update) {
            const featureIndex = source.findIndex(f => f.id === id);
            if (featureIndex === -1) continue;

            const feature = source[featureIndex];

            // get updated geojsonvt simplified feature
            const updatedFeature = getUpdatedFeature(feature, update, options);
            if (!updatedFeature) continue;

            // track both features for invalidation
            affected.push(feature, updatedFeature);

            // replace old feature with updated feature
            source[featureIndex] = updatedFeature;
        }
    }

    return {affected, source};
}

// return an updated geojsonvt simplified feature
function getUpdatedFeature(vtFeature, update, options) {
    const changeGeometry = !!update.newGeometry;

    const changeProps =
        update.removeAllProperties ||
        update.removeProperties?.length > 0 ||
        update.addOrUpdateProperties?.length > 0;

    // nothing to do
    if (!changeGeometry && !changeProps) return null;

    // if geometry changed, need to create new geojson feature and convert to simplified format
    if (changeGeometry) {
        const geojsonFeature = {
            type: 'Feature',
            id: vtFeature.id,
            geometry: update.newGeometry,
            properties: changeProps ? applyPropertyUpdates(vtFeature.tags, update) : vtFeature.tags
        };

        // projects and adds simplification info
        let features = convert({type: 'FeatureCollection', features: [geojsonFeature]}, options);

        // wraps features (ie extreme west and extreme east)
        features = wrap(features, options);

        return features[0];
    }

    // only properties changed - update tags directly
    if (changeProps) {
        const feature = {...vtFeature};
        feature.tags = applyPropertyUpdates(feature.tags, update);
        return feature;
    }

    return null;
}

// helper to apply property updates from a diff update object to a properties object
function applyPropertyUpdates(tags, update) {
    if (update.removeAllProperties) {
        return {};
    }

    const properties = {...tags || {}};

    if (update.removeProperties) {
        for (const key of update.removeProperties) {
            delete properties[key];
        }
    }

    if (update.addOrUpdateProperties) {
        for (const {key, value} of update.addOrUpdateProperties) {
            properties[key] = value;
        }
    }

    return properties;
}

// Convert a GeoJSON Source Diff to an idempotent hashed representation using Sets and Maps
export function diffToHashed(diff) {
    if (!diff) return {};

    const hashed = {};

    hashed.removeAll = diff.removeAll;
    hashed.remove = new Set(diff.remove || []);
    hashed.add    = new Map(diff.add?.map(feature => [feature.id, feature]));
    hashed.update = new Map(diff.update?.map(update => [update.id, update]));

    return hashed;
}

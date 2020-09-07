import {terser} from 'rollup-plugin-terser';
import buble from '@rollup/plugin-buble';

const config = (file, plugins) => ({
    input: 'src/index.js',
    output: {
        name: 'geojsonvt',
        format: 'umd',
        indent: false,
        file
    },
    plugins
});

const bubleConfig = {
  transforms: {
    dangerousForOf: true,
  },
  objectAssign: 'Object.assign',
};

export default [
    config('geojson-vt-dev.js', [buble(bubleConfig)]),
    config('geojson-vt.js', [terser(), buble(bubleConfig)])
];

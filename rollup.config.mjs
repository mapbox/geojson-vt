import terser from '@rollup/plugin-terser';

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

export default [
    config('geojson-vt-dev.js', []),
    config('geojson-vt.js', [terser()])
];

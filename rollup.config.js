import babelPlugin from '@rollup/plugin-babel'
import pkg from './package.json';

export default [
	{
		input: 'src/index.js',
    external: ['query-string'],
		output: [
			{ file: pkg.main, format: 'cjs' },
		],
		plugins: [babelPlugin({ babelHelpers: 'bundled' })]
	},
];

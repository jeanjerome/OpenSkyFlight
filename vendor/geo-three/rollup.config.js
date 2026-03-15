import strip from '@rollup/plugin-strip';
import typescript from '@rollup/plugin-typescript';

export default {
	input: 'source/Main.ts',
	external: ['three'],
	plugins: [
		typescript({
			tsconfig: './tsconfig.json'
		}),
		strip({
			functions: ['assert.*', 'debug', 'alert', 'console.*']
		})
	],
	output: {
		format: 'es',
		file: 'geo-three.module.js',
		indent: '\t'
	}
};

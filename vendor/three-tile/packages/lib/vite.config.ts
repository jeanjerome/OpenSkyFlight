import { defineConfig } from "vite";

export default defineConfig({
	build: {
		target: "es2020",
		outDir: "./dist",
		lib: {
			entry: "./src/index.ts",
			name: "ThreeTile",
			fileName: "three-tile-osf",
		},
		rollupOptions: {
			external: ["three", "three/tsl", /^three\/examples\/.*/],
			output: {
				globals: {
					three: "THREE",
					"three/tsl": "THREE",
				},
			},
		},
	},
});

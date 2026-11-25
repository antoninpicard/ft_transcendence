import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Build the Vue front into dist/; in dev mode (npm run dev), forward /api and /ws to the API on port 3001
export default defineConfig({
	plugins: [vue()],
	build: {
		outDir: "dist",
		emptyOutDir: true
	},
	server: {
		proxy: {
			"/api": { target: "http://localhost:3001" },
			"/ws": { target: "ws://localhost:3001", ws: true }
		}
	}
});

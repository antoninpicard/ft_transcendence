import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// Vue front lives in webapp/, built into webapp/dist and served by Express
export default defineConfig({
	root: "webapp",
	plugins: [vue(), tailwindcss()],
	build: {
		outDir: "dist",
		emptyOutDir: true
	},
	// Dev mode (npm run dev): forward API calls and the WebSocket to the Express HTTPS server
	server: {
		proxy: {
			"/api": { target: "https://localhost:3000", secure: false },
			"/ws": { target: "wss://localhost:3000", ws: true, secure: false }
		}
	}
});

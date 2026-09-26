import { defineConfig } from "vite";
import { version } from "./package.json";

// Tauri expects a fixed dev-server port and does not need an index of node modules.
// https://v2.tauri.app/start/frontend/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    host: host || false,
    port: 5173,
    strictPort: true,
  },
  // Produce assets the system WebView2 can run; no legacy targets needed.
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
  },
});

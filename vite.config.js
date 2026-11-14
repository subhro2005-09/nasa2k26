import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import cesium from 'vite-plugin-cesium';

// vite-plugin-cesium injects Cesium.js (~4 MB) + widgets.css into EVERY html entry.
// Only the atlas page needs it; the app shell just embeds that page in an iframe.
// Scoping the injection stops the shell from downloading and parsing Cesium twice.
const atlasOnly = () => {
  const plugin = cesium();
  const inject = plugin.transformIndexHtml;
  return {
    ...plugin,
    transformIndexHtml: (_html, ctx) => (/mars-atlas\.html$/.test(ctx?.filename || ctx?.path || '') ? inject() : [])
  };
};

export default defineConfig({
  // preact/compat is API-compatible with React 18 hooks/context/lazy; ~4 KB instead of ~45 KB gzipped.
  plugins: [preact(), tailwindcss(), atlasOnly()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: { input: { main: 'index.html', marsAtlas: 'mars-atlas.html' } }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8000', changeOrigin: true }
    }
  }
});

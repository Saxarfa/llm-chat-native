import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {alias: {'@': path.resolve(import.meta.dirname, './src')}},
  server: {port: 5173, proxy: Object.fromEntries(['/api','/v1','/props','/health','/js','/css','/manifest.json'].map(p=>[p,{target:process.env.CHAT_DEV_API || 'http://127.0.0.1:18000',changeOrigin:true}]))},
  // Open tabs still reference the preceding build's lazy JS/CSS chunks.
  // Keep those hashed assets available while replacing the HTML entry point.
  build: {outDir:'dist', assetsDir:'ui-assets', emptyOutDir:false, chunkSizeWarningLimit:650}
});

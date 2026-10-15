import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const norm = id.replace(/\\/g, '/');
            if (norm.includes('node_modules')) {
              if (norm.includes('@supabase')) return 'supabase-vendor';
              if (norm.includes('lucide-react')) return 'icons';
              // react/react-dom must live in their own chunk: if shared CJS
              // helpers land inside the lazy chunks, the entry ends up
              // importing them and they get preloaded at boot.
              if (norm.includes('/react-dom/') || norm.includes('/react/') || norm.includes('/scheduler/')) return 'react-vendor';
              if (norm.includes('/leaflet/') || norm.includes('/react-leaflet/') || norm.includes('/@react-leaflet/')) return 'map-vendor';
              if (norm.includes('react-markdown') || norm.includes('remark') || norm.includes('micromark') || norm.includes('unified')) return 'markdown-vendor';
            }
          },
        },
      },
    },
  };
});

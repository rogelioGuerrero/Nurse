import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'supabase-vendor': ['@supabase/supabase-js'],
            'icons': ['lucide-react'],
            'map-vendor': ['leaflet', 'react-leaflet'],
            'markdown-vendor': ['react-markdown'],
          },
        },
      },
    },
  };
});

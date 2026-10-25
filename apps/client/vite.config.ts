import {defineConfig} from 'vite';
export default defineConfig({server:{port:5173,strictPort:true,fs:{allow:['../..']}},build:{target:'es2022',chunkSizeWarningLimit:1800}});

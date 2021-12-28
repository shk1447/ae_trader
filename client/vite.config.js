import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const path = require('path');

// https://vitejs.dev/config/
export default defineConfig({
  base:'./',
  build: {
    outDir:'../dist'
  },
  resolve: {
    alias:{
      '@': path.resolve(__dirname, './src')
    }
  },
  plugins: [react()],
  server: {
    host:'0.0.0.0',
    port:'8080',
    proxy: {
      '/stock': {
        target:'http://localhost:8081',
        changeOrigin:true
      },
      '/auth': {
        target:'http://localhost:8081',
        changeOrigin:true
      },
      '/vases': {
        target:'http://localhost:8081',
        changeOrigin:true,
        ws:true
      }
    }
  }
})

/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // os testes do ZARO (zaro/app) rodam com o vitest da própria pasta
  test: { include: ['src/**/*.test.{ts,tsx}'] },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { charts: ['recharts'], xlsx: ['xlsx'], react: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
})

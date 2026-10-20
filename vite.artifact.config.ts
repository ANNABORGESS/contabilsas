// Build de arquivo único para publicar o painel como link (abre no celular).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: { 'import.meta.env.VITE_ARTIFACT': JSON.stringify('1') },
  build: { outDir: 'dist-artifact', emptyOutDir: true },
})

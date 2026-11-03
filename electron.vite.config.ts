import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string
export default defineConfig({
  main: { build: { rollupOptions: { input: resolve('electron/main.ts') } } },
  preload: {
    build: {
      rollupOptions: {
        input: resolve('electron/preload.ts'),
        output: { format: 'cjs', entryFileNames: 'preload.cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src'),
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: { rollupOptions: { input: resolve('src/index.html') } },
  },
})

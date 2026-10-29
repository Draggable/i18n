import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import banner from 'vite-plugin-banner'
import compression from 'vite-plugin-compression'

const pkg = require('./package.json')

const bannerTemplate = `
/**
${pkg.name} - ${pkg.homepage}
Version: ${pkg.version}
Author: ${pkg.author}
*/
`

/**
 * Emit extra files next to the existing builds:
 * - i18n.cjs: the CommonJS build with a .cjs extension so Node parses it as CommonJS ("type": "module")
 * - i18n.d.ts / i18n.d.cts: type declarations for the ES and CommonJS builds
 */
const extraDistFiles = () => ({
  name: 'extra-dist-files',
  closeBundle() {
    const dist = path.resolve(__dirname, 'dist')
    fs.copyFileSync(path.join(dist, 'i18n.cjs.min.js'), path.join(dist, 'i18n.cjs'))
    for (const file of ['i18n.d.ts', 'i18n.d.cts']) {
      fs.copyFileSync(path.resolve(__dirname, 'src/mi18n.d.ts'), path.join(dist, file))
    }
  },
})

export default defineConfig({
  plugins: [
    extraDistFiles(),
    banner(bannerTemplate),
    compression({
      algorithm: 'gzip',
      minRatio: 0.8,
      ext: '.gz',
      threshold: 10240,
    }),
  ],
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/mi18n.js',
      name: 'i18n',
      formats: ['es', 'cjs', 'umd', 'iife'],
      fileName: format => `i18n.${format}.min.js`,
      outDir: 'dist',
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        banner: bannerTemplate,
      },
    },
    sourcemap: process.env.NODE_ENV === 'production' ? 'inline' : false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.js', '.json'],
  },
  server: {
    open: true,
    port: 3000,
    strictPort: true,
  },
})

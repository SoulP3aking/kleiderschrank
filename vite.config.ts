import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Offline-Fähigkeit:
 *  1. transformers.js lädt die ONNX-Laufzeit vom jsDelivr-CDN – die ~27 MB
 *     große Kopie, die Vite sonst mitbündelt, wird nie benutzt und fliegt raus.
 *  2. Alle gebauten Dateien werden in sw.js eingetragen, damit die App schon
 *     nach dem ersten Besuch komplett offline startet.
 */
function offlinePlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'kleiderschrank-offline',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) if (name.endsWith('.wasm')) delete bundle[name]
    },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((f) => {
          const p = join(dir, f)
          return statSync(p).isDirectory() ? walk(p) : [p]
        })
      const files = walk(outDir)
        .map((p) => relative(outDir, p).replaceAll('\\', '/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort()
      const swPath = join(outDir, 'sw.js')
      const template = readFileSync(swPath, 'utf8')
      // Auch Änderungen am Service Worker selbst ergeben eine neue Version.
      const hash = createHash('sha1').update(template)
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)))
      const sw = template
        .replace("'__PRECACHE__'", JSON.stringify(files))
        .replace('__VERSION__', hash.digest('hex').slice(0, 10))
      writeFileSync(swPath, sw)
    },
  }
}

// base: './' => die Seite läuft unter JEDEM Pfad (auch unter
// https://<name>.github.io/<repo>/), ohne dass hier etwas angepasst werden muss.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), offlinePlugin()],
  worker: { format: 'es' },
  // Sonst bündelt Vite die KI-Bibliothek erst beim ersten Freistellen und lädt
  // dabei die Seite neu (nur im Entwicklungsmodus relevant).
  optimizeDeps: { include: ['@huggingface/transformers'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: '0.0.0.0', port: 5173 },
})

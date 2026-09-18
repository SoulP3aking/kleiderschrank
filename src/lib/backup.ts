/**
 * Sicherung als ZIP-Datei. Wichtig, weil alles nur im Browser liegt:
 * Browserdaten gelöscht oder neues Handy = Schrank weg, wenn es kein Backup gibt.
 */
import { unzip, zip, type Unzipped, type Zippable } from 'fflate'
import * as db from './db'
import { download } from './exportImage'
import type { Item, Outfit, PlanEntry, Settings } from './types'

const VERSION = 1

interface Manifest {
  version: number
  exportedAt: string
  items: Item[]
  outfits: Outfit[]
  plan: PlanEntry[]
  settings: Settings
}

const zipAsync = (data: Zippable) =>
  new Promise<Uint8Array>((resolve, reject) =>
    zip(data, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out))),
  )

const unzipAsync = (data: Uint8Array) =>
  new Promise<Unzipped>((resolve, reject) =>
    unzip(data, (err, out) => (err ? reject(err) : resolve(out))),
  )

/** Alle Bildschlüssel, die tatsächlich noch gebraucht werden. */
function usedImageKeys(items: Item[], outfits: Outfit[], settings: Settings) {
  const keys = new Set<string>()
  items.forEach((i) => [i.imageFront, i.imageBack, i.thumb].forEach((k) => k && keys.add(k)))
  outfits.forEach((o) => o.cover && keys.add(o.cover))
  ;[settings.figure.photoFront, settings.figure.photoBack].forEach((k) => k && keys.add(k))
  return keys
}

export async function exportBackup(onProgress?: (text: string) => void) {
  onProgress?.('Daten werden gesammelt …')
  const [items, outfits, plan, settings] = await Promise.all([
    db.allItems(),
    db.allOutfits(),
    db.allPlan(),
    db.loadSettings(),
  ])
  const manifest: Manifest = {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    items,
    outfits,
    plan,
    settings,
  }

  const files: Zippable = {
    'daten.json': [new TextEncoder().encode(JSON.stringify(manifest)), { level: 6 }],
  }
  const keys = [...usedImageKeys(items, outfits, settings)]
  let done = 0
  for (const key of keys) {
    const blob = await db.getImage(key)
    if (!blob) continue
    // PNGs sind bereits komprimiert – nochmal packen bringt nichts und kostet Zeit.
    files[`bilder/${key}.png`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]
    done++
    if (done % 5 === 0) onProgress?.(`Bilder werden gepackt … ${done}/${keys.length}`)
  }

  onProgress?.('ZIP wird erstellt …')
  const packed = await zipAsync(files)
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([packed as unknown as BlobPart], { type: 'application/zip' })
  download(blob, `kleiderschrank-backup-${stamp}.zip`)
  onProgress?.(`Fertig: ${items.length} Teile, ${outfits.length} Outfits gesichert.`)
  return { items: items.length, outfits: outfits.length, bytes: blob.size }
}

export interface ImportResult {
  items: number
  outfits: number
  plan: number
  skipped: number
}

export async function importBackup(
  file: File,
  mode: 'ersetzen' | 'hinzufügen',
  onProgress?: (text: string) => void,
): Promise<ImportResult> {
  onProgress?.('Backup wird gelesen …')
  const raw = new Uint8Array(await file.arrayBuffer())
  const entries = await unzipAsync(raw)
  const manifestRaw = entries['daten.json']
  if (!manifestRaw) throw new Error('Das ist keine Kleiderschrank-Sicherung (daten.json fehlt).')
  const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as Manifest
  if (typeof manifest.version !== 'number' || !Array.isArray(manifest.items)) {
    throw new Error('Die Sicherung ist beschädigt.')
  }

  if (mode === 'ersetzen') {
    onProgress?.('Alter Bestand wird geleert …')
    await db.wipeAll()
  }

  onProgress?.('Bilder werden eingespielt …')
  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.startsWith('bilder/')) continue
    const key = path.slice('bilder/'.length).replace(/\.png$/, '')
    await db.putImage(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }), key)
  }

  const existingItems = new Set((await db.allItems()).map((i) => i.id))
  const existingOutfits = new Set((await db.allOutfits()).map((o) => o.id))
  let skipped = 0
  let items = 0
  let outfits = 0

  for (const item of manifest.items) {
    if (mode === 'hinzufügen' && existingItems.has(item.id)) {
      skipped++
      continue
    }
    await db.putItem(item)
    items++
  }
  for (const outfit of manifest.outfits ?? []) {
    if (mode === 'hinzufügen' && existingOutfits.has(outfit.id)) {
      skipped++
      continue
    }
    await db.putOutfit(outfit)
    outfits++
  }
  // Beim Dazupacken gewinnt dein aktueller Kalender, ältere Einträge überschreiben nichts.
  const existingDays = new Set((await db.allPlan()).map((p) => p.date))
  let plan = 0
  for (const entry of manifest.plan ?? []) {
    if (mode === 'hinzufügen' && existingDays.has(entry.date)) continue
    await db.putPlan(entry)
    plan++
  }
  if (mode === 'ersetzen' && manifest.settings) {
    await db.saveSettings(manifest.settings)
  }

  onProgress?.('Fertig.')
  return { items, outfits, plan, skipped }
}

export const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(2)} GB`
}

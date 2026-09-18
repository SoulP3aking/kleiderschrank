import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { DEFAULT_SETTINGS, type Item, type Outfit, type PlanEntry, type Settings } from './types'

interface WardrobeDB extends DBSchema {
  items: { key: string; value: Item; indexes: { bySlot: string; byCreated: number } }
  images: { key: string; value: Blob }
  outfits: { key: string; value: Outfit; indexes: { byCreated: number } }
  plan: { key: string; value: PlanEntry }
  settings: { key: string; value: unknown }
}

let dbp: Promise<IDBPDatabase<WardrobeDB>> | null = null

export function db() {
  if (!dbp) {
    dbp = openDB<WardrobeDB>('kleiderschrank', 1, {
      upgrade(d) {
        const items = d.createObjectStore('items', { keyPath: 'id' })
        items.createIndex('bySlot', 'slot')
        items.createIndex('byCreated', 'createdAt')
        d.createObjectStore('images')
        const outfits = d.createObjectStore('outfits', { keyPath: 'id' })
        outfits.createIndex('byCreated', 'createdAt')
        d.createObjectStore('plan', { keyPath: 'date' })
        d.createObjectStore('settings')
      },
    })
  }
  return dbp
}

export const uid = (): string =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36))

/* ---------------- Bilder ---------------- */

export async function putImage(blob: Blob, key = uid()) {
  await (await db()).put('images', blob, key)
  return key
}

export async function getImage(key: string | null | undefined) {
  if (!key) return null
  return (await (await db()).get('images', key)) ?? null
}

export async function deleteImage(key: string | null | undefined) {
  if (!key) return
  await (await db()).delete('images', key)
}

/* ---------------- Teile ---------------- */

export async function allItems() {
  return (await db()).getAll('items')
}

export async function putItem(item: Item) {
  await (await db()).put('items', item)
  return item
}

export async function getItem(id: string) {
  return (await (await db()).get('items', id)) ?? null
}

export async function deleteItem(id: string) {
  const d = await db()
  const item = await d.get('items', id)
  if (item) {
    for (const key of [item.imageFront, item.imageBack, item.thumb]) {
      if (key) await d.delete('images', key)
    }
  }
  await d.delete('items', id)
  // Teil aus allen Outfits entfernen, damit keine Leichen bleiben.
  const outfits = await d.getAll('outfits')
  for (const o of outfits) {
    if (o.itemIds.includes(id)) {
      await d.put('outfits', { ...o, itemIds: o.itemIds.filter((x) => x !== id) })
    }
  }
}

/* ---------------- Outfits ---------------- */

export async function allOutfits() {
  return (await db()).getAll('outfits')
}

export async function putOutfit(outfit: Outfit) {
  await (await db()).put('outfits', outfit)
  return outfit
}

export async function deleteOutfit(id: string) {
  const d = await db()
  const o = await d.get('outfits', id)
  if (o?.cover) await d.delete('images', o.cover)
  await d.delete('outfits', id)
  const entries = await d.getAll('plan')
  for (const e of entries) {
    if (e.outfitId === id) await d.put('plan', { ...e, outfitId: null })
  }
}

/* ---------------- Kalender ---------------- */

export async function allPlan() {
  return (await db()).getAll('plan')
}

export async function putPlan(entry: PlanEntry) {
  await (await db()).put('plan', entry)
  return entry
}

export async function deletePlan(date: string) {
  await (await db()).delete('plan', date)
}

/* ---------------- Einstellungen ---------------- */

export async function loadSettings(): Promise<Settings> {
  const stored = (await (await db()).get('settings', 'main')) as Partial<Settings> | undefined
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    figure: { ...DEFAULT_SETTINGS.figure, ...(stored?.figure ?? {}) },
  }
}

export async function saveSettings(settings: Settings) {
  await (await db()).put('settings', settings, 'main')
}

/** Wie viel Platz belegt der Schrank und wie viel darf er noch belegen? */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

/** Fragt den Browser, die Daten NICHT automatisch aufzuraeumen. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted?.()) return true
  return navigator.storage.persist()
}

export async function wipeAll() {
  const d = await db()
  await Promise.all(
    (['items', 'images', 'outfits', 'plan', 'settings'] as const).map((s) => d.clear(s)),
  )
}

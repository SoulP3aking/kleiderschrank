import { create } from 'zustand'
import * as db from './db'
import { forgetImage } from './imageUrls'
import {
  DEFAULT_SETTINGS,
  newPlacement,
  slotOf,
  type Item,
  type Outfit,
  type PlanEntry,
  type Placement,
  type Settings,
  type View,
} from './types'

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface State {
  ready: boolean
  items: Item[]
  outfits: Outfit[]
  plan: Record<string, PlanEntry>
  settings: Settings
  /** Fotos, die ausgewählt, aber noch nicht fertig bearbeitet sind. */
  pendingCount: number

  load: () => Promise<void>
  refreshPending: () => Promise<void>
  discardPending: () => Promise<void>
  addItem: (item: Item) => Promise<void>
  updateItem: (id: string, patch: Partial<Item>) => Promise<void>
  setPlacement: (id: string, view: View, patch: Partial<Placement>) => Promise<void>
  removeItem: (id: string) => Promise<void>
  markWorn: (itemIds: string[], when?: number) => Promise<void>

  saveOutfit: (outfit: Outfit) => Promise<void>
  removeOutfit: (id: string) => Promise<void>

  setPlan: (entry: PlanEntry) => Promise<void>
  removePlan: (date: string) => Promise<void>

  updateSettings: (patch: Partial<Settings>) => Promise<void>
  reloadAll: () => Promise<void>
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  items: [],
  outfits: [],
  plan: {},
  settings: DEFAULT_SETTINGS,
  pendingCount: 0,

  load: async () => {
    const [items, outfits, planList, settings, pending] = await Promise.all([
      db.allItems(),
      db.allOutfits(),
      db.allPlan(),
      db.loadSettings(),
      db.pendingIds(),
    ])
    const plan: Record<string, PlanEntry> = {}
    planList.forEach((p) => (plan[p.date] = p))
    set({
      ready: true,
      items: items.sort((a, b) => b.createdAt - a.createdAt),
      outfits: outfits.sort((a, b) => b.createdAt - a.createdAt),
      plan,
      settings,
      pendingCount: pending.length,
    })
  },

  refreshPending: async () => {
    set({ pendingCount: (await db.pendingIds()).length })
  },

  discardPending: async () => {
    await db.clearPending()
    set({ pendingCount: 0 })
  },

  reloadAll: async () => {
    set({ ready: false })
    await get().load()
  },

  addItem: async (item) => {
    await db.putItem(item)
    set({ items: [item, ...get().items] })
  },

  updateItem: async (id, patch) => {
    const current = get().items.find((i) => i.id === id)
    if (!current) return
    const next: Item = { ...current, ...patch }
    if (patch.category && !patch.slot) next.slot = slotOf(patch.category)
    // Slotwechsel: Standardposition neu setzen, sonst hängt die Hose am Kopf.
    if (next.slot !== current.slot && !patch.placement)
      next.placement = newPlacement(next.slot, next.aspect ?? 1, next.aspectBack ?? null)
    await db.putItem(next)
    set({ items: get().items.map((i) => (i.id === id ? next : i)) })
  },

  setPlacement: async (id, view, patch) => {
    const current = get().items.find((i) => i.id === id)
    if (!current) return
    const next: Item = {
      ...current,
      placement: { ...current.placement, [view]: { ...current.placement[view], ...patch } },
    }
    await db.putItem(next)
    set({ items: get().items.map((i) => (i.id === id ? next : i)) })
  },

  removeItem: async (id) => {
    const item = get().items.find((i) => i.id === id)
    ;[item?.imageFront, item?.imageBack, item?.thumb].forEach(forgetImage)
    await db.deleteItem(id)
    set({
      items: get().items.filter((i) => i.id !== id),
      outfits: get().outfits.map((o) => ({ ...o, itemIds: o.itemIds.filter((x) => x !== id) })),
    })
  },

  markWorn: async (itemIds, when = Date.now()) => {
    const items = get().items.map((i) =>
      itemIds.includes(i.id) ? { ...i, wearCount: i.wearCount + 1, lastWorn: when } : i,
    )
    await Promise.all(items.filter((i) => itemIds.includes(i.id)).map((i) => db.putItem(i)))
    set({ items })
  },

  saveOutfit: async (outfit) => {
    await db.putOutfit(outfit)
    const rest = get().outfits.filter((o) => o.id !== outfit.id)
    set({ outfits: [outfit, ...rest].sort((a, b) => b.createdAt - a.createdAt) })
  },

  removeOutfit: async (id) => {
    const o = get().outfits.find((x) => x.id === id)
    forgetImage(o?.cover)
    await db.deleteOutfit(id)
    const plan = { ...get().plan }
    Object.values(plan).forEach((e) => {
      if (e.outfitId === id) plan[e.date] = { ...e, outfitId: null }
    })
    set({ outfits: get().outfits.filter((x) => x.id !== id), plan })
  },

  setPlan: async (entry) => {
    await db.putPlan(entry)
    set({ plan: { ...get().plan, [entry.date]: entry } })
  },

  removePlan: async (date) => {
    await db.deletePlan(date)
    const plan = { ...get().plan }
    delete plan[date]
    set({ plan })
  },

  updateSettings: async (patch) => {
    const next = { ...get().settings, ...patch }
    await db.saveSettings(next)
    set({ settings: next })
  },
}))

export const useItem = (id: string | null | undefined) =>
  useStore((s) => (id ? s.items.find((i) => i.id === id) ?? null : null))

/**
 * Geometrie der Ankleide-Fläche. Wird an drei Stellen gebraucht und muss
 * überall identisch sein: Anzeige, Treffererkennung beim Antippen und
 * der PNG-Export.
 */
import { SLOT_Z, type Item, type Placement, type View } from './types'
import { imageUrl } from './imageUrls'

/** Seitenverhältnis der Bühne: schmal und hoch wie ein Mensch. */
export const STAGE_RATIO = 0.5 // Breite / Höhe

export interface LayerBox {
  cx: number
  cy: number
  w: number
  h: number
  rot: number
  flip: boolean
}

export function layerBox(
  placement: Placement,
  stageW: number,
  stageH: number,
  imageAspect: number,
): LayerBox {
  const w = placement.scale * stageW
  return {
    cx: placement.x * stageW,
    cy: placement.y * stageH,
    w,
    h: w / (imageAspect || 1),
    rot: placement.rotation,
    flip: placement.flip,
  }
}

export const layerZ = (item: Item) => SLOT_Z[item.slot] * 10 + item.placement.front.zOffset

/** Teile eines Outfits in Zeichenreihenfolge (hinten nach vorne). */
export function sortedLayers(items: Item[], view: View) {
  return [...items].sort(
    (a, b) =>
      SLOT_Z[a.slot] * 10 + a.placement[view].zOffset -
      (SLOT_Z[b.slot] * 10 + b.placement[view].zOffset),
  )
}

export const imageKeyFor = (item: Item, view: View) =>
  view === 'back' ? item.imageBack ?? item.imageFront : item.imageFront

/* ---------------- Treffererkennung ---------------- */

interface AlphaMap {
  w: number
  h: number
  aspect: number
  alpha: Uint8Array
}

const alphaMaps = new Map<string, AlphaMap>()
const building = new Map<string, Promise<AlphaMap | null>>()

/**
 * Kleine Alpha-Karte pro Bild: damit ein Tipp auf eine durchsichtige Stelle
 * der Jacke das Teil darunter trifft – und nicht die Jacke.
 */
export async function alphaMapFor(key: string): Promise<AlphaMap | null> {
  const hit = alphaMaps.get(key)
  if (hit) return hit
  const running = building.get(key)
  if (running) return running
  const p = (async () => {
    const url = await imageUrl(key)
    if (!url) return null
    const img = await new Promise<HTMLImageElement | null>((res) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = () => res(null)
      el.src = url
    })
    if (!img) return null
    const w = 72
    const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    const alpha = new Uint8Array(w * h)
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
    const map: AlphaMap = { w, h, alpha, aspect: img.naturalWidth / img.naturalHeight }
    alphaMaps.set(key, map)
    return map
  })()
  building.set(key, p)
  const map = await p
  building.delete(key)
  return map
}

export const cachedAspect = (key: string | null | undefined) =>
  key ? alphaMaps.get(key)?.aspect ?? 1 : 1

/** Trifft der Punkt (in Bühnen-Pixeln) das Teil an einer sichtbaren Stelle? */
export function hitsLayer(px: number, py: number, box: LayerBox, map: AlphaMap) {
  const dx = px - box.cx
  const dy = py - box.cy
  const rad = (-box.rot * Math.PI) / 180
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad)
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad)
  let u = lx / box.w + 0.5
  const v = ly / box.h + 0.5
  if (box.flip) u = 1 - u
  if (u < 0 || u > 1 || v < 0 || v > 1) return false
  const x = Math.min(map.w - 1, Math.floor(u * map.w))
  const y = Math.min(map.h - 1, Math.floor(v * map.h))
  return map.alpha[y * map.w + x] > 40
}

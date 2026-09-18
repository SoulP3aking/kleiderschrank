/** Outfit als PNG rendern – zum Speichern oder Teilen. */
import { silhouetteDataUrl } from '../components/Silhouette'
import { canvasOf, canvasToBlob, ctxOf } from './image'
import { loadImageElement } from './imageUrls'
import { imageKeyFor, layerBox, sortedLayers } from './stage'
import type { Figure, Item, View } from './types'

function loadUrl(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Zeichnet Figur + angezogene Teile in einen Bereich des Canvas. */
async function drawFigure(
  ctx: CanvasRenderingContext2D,
  items: Item[],
  view: View,
  figure: Figure,
  x: number,
  y: number,
  outerW: number,
  outerH: number,
) {
  // Wie auf dem Bildschirm: Figurfläche immer 1:2 und mittig, sonst verrutschen die Teile.
  const w = Math.min(outerW, outerH / 2)
  const h = w * 2
  x += (outerW - w) / 2
  y += (outerH - h) / 2
  if (figure.mode === 'foto') {
    const photo = await loadImageElement(view === 'back' ? figure.photoBack : figure.photoFront)
    if (photo) {
      const f = Math.min(w / photo.naturalWidth, h / photo.naturalHeight)
      const pw = photo.naturalWidth * f
      const ph = photo.naturalHeight * f
      ctx.globalAlpha = figure.photoOpacity
      ctx.drawImage(photo, x + (w - pw) / 2, y + (h - ph) / 2, pw, ph)
      ctx.globalAlpha = 1
    }
  } else {
    const svg = await loadUrl(silhouetteDataUrl(figure, view))
    if (svg) ctx.drawImage(svg, x, y, w, h)
  }

  for (const item of sortedLayers(items, view)) {
    const key = imageKeyFor(item, view)
    const img = await loadImageElement(key)
    if (!img) continue
    const box = layerBox(item.placement[view], w, h, img.naturalWidth / img.naturalHeight)
    ctx.save()
    ctx.translate(x + box.cx, y + box.cy)
    ctx.rotate((box.rot * Math.PI) / 180)
    ctx.scale(box.flip ? -1 : 1, 1)
    ctx.drawImage(img, -box.w / 2, -box.h / 2, box.w, box.h)
    ctx.restore()
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export async function renderOutfitPng(
  items: Item[],
  view: View,
  figure: Figure,
  opts: { title?: string; mode?: 'karte' | 'figur' } = {},
) {
  const mode = opts.mode ?? 'karte'

  if (mode === 'figur') {
    const c = canvasOf(600, 1200)
    const ctx = ctxOf(c)
    await drawFigure(ctx, items, view, figure, 0, 0, 600, 1200)
    return canvasToBlob(c)
  }

  const W = 1080
  const H = 1620
  const c = canvasOf(W, H)
  const ctx = ctxOf(c)

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#14141a')
  bg.addColorStop(0.55, '#0e0e13')
  bg.addColorStop(1, '#171722')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = '#ffffff'
  ctx.font = `700 50px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  const title = opts.title?.trim() || 'Mein Outfit'
  ctx.fillText(title.length > 26 ? title.slice(0, 25) + '…' : title, 64, 100)

  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `400 27px ${FONT}`
  const parts = items.map((i) => i.category)
  ctx.fillText(
    `${view === 'front' ? 'Vorderansicht' : 'Rückansicht'} · ${parts.slice(0, 4).join(' · ')}`,
    64,
    145,
  )

  const fx = (W - 620) / 2
  const fy = 185
  await drawFigure(ctx, items, view, figure, fx, fy, 620, 1140)

  // Teilestreifen unten
  const strip = items.slice(0, 6)
  const boxW = 140
  const gap = 18
  const totalW = strip.length * boxW + (strip.length - 1) * gap
  let sx = (W - totalW) / 2
  const sy = 1372
  for (const item of strip) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    roundRect(ctx, sx, sy, boxW, boxW, 22)
    ctx.fill()
    const img = await loadImageElement(item.thumb ?? item.imageFront)
    if (img) {
      const pad = 14
      const inner = boxW - pad * 2
      const f = Math.min(inner / img.naturalWidth, inner / img.naturalHeight)
      const iw = img.naturalWidth * f
      const ih = img.naturalHeight * f
      ctx.drawImage(img, sx + (boxW - iw) / 2, sy + (boxW - ih) / 2, iw, ih)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `500 19px ${FONT}`
    ctx.textAlign = 'center'
    const label = item.name.length > 13 ? item.name.slice(0, 12) + '…' : item.name
    ctx.fillText(label, sx + boxW / 2, sy + boxW + 32)
    ctx.textAlign = 'left'
    sx += boxW + gap
  }

  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.font = `400 21px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('Digitaler Kleiderschrank', W / 2, H - 46)
  ctx.textAlign = 'left'

  return canvasToBlob(c)
}

/** Teilen (Handy) bzw. Herunterladen (Desktop). */
export async function shareOrDownload(blob: Blob, filename: string, title = 'Mein Outfit') {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title })
      return 'geteilt'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'abgebrochen'
    }
  }
  download(blob, filename)
  return 'gespeichert'
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

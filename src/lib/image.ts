/** Bild-Werkzeuge: laden, verkleinern, Maske anwenden, zuschneiden, Zauberstab. */

export const MAX_EDIT = 1024
export const MAX_STORE = 900
export const MAX_THUMB = 240

export function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

export function ctxOf(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas nicht verfügbar')
  return ctx
}

/** Lädt ein Foto und verkleinert es auf eine handliche Kantenlänge. */
export async function loadScaled(blob: Blob, maxEdge = MAX_EDIT): Promise<ImageData> {
  const bmp = await createImageBitmap(blob)
  const f = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
  const c = canvasOf(bmp.width * f, bmp.height * f)
  const ctx = ctxOf(c)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return ctx.getImageData(0, 0, c.width, c.height)
}

export function imageDataToCanvas(data: ImageData) {
  const c = canvasOf(data.width, data.height)
  ctxOf(c).putImageData(data, 0, 0)
  return c
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))),
      type,
      quality,
    ),
  )
}

/** Setzt den Alphakanal eines Bildes aus einer Graustufen-Maske (0..255). */
export function applyMask(src: ImageData, mask: Uint8ClampedArray): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) {
    out.data[p] = mask[i]
  }
  return out
}

/** Volle Maske (alles sichtbar). */
export const fullMask = (w: number, h: number) => new Uint8ClampedArray(w * h).fill(255)

export function maskFromAlpha(data: ImageData) {
  const m = new Uint8ClampedArray(data.width * data.height)
  for (let i = 0, p = 3; i < m.length; i++, p += 4) m[i] = data.data[p]
  return m
}

/** Schneidet transparente Ränder weg und lässt etwas Luft stehen. */
export function autoCrop(data: ImageData, padding = 6, threshold = 12): ImageData {
  const { width: w, height: h, data: px } = data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return data
  minX = Math.max(0, minX - padding)
  minY = Math.max(0, minY - padding)
  maxX = Math.min(w - 1, maxX + padding)
  maxY = Math.min(h - 1, maxY + padding)
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const src = imageDataToCanvas(data)
  const out = canvasOf(cw, ch)
  const ctx = ctxOf(out)
  ctx.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch)
  return ctx.getImageData(0, 0, cw, ch)
}

export function resizeImageData(data: ImageData, maxEdge: number): ImageData {
  const f = Math.min(1, maxEdge / Math.max(data.width, data.height))
  if (f === 1) return data
  const src = imageDataToCanvas(data)
  const out = canvasOf(data.width * f, data.height * f)
  const ctx = ctxOf(out)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return ctx.getImageData(0, 0, out.width, out.height)
}

/**
 * Zauberstab: entfernt ab dem angetippten Punkt alle zusammenhängenden Pixel
 * mit ähnlicher Farbe. Genau das, was man für einen einfarbigen Hintergrund
 * (Bett, Boden, Wand) braucht.
 */
export function magicWand(
  src: ImageData,
  mask: Uint8ClampedArray,
  sx: number,
  sy: number,
  tolerance: number,
  mode: 'remove' | 'restore' = 'remove',
) {
  const { width: w, height: h, data: px } = src
  sx = Math.round(sx)
  sy = Math.round(sy)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return mask
  const out = new Uint8ClampedArray(mask)
  const start = (sy * w + sx) * 4
  const r0 = px[start]
  const g0 = px[start + 1]
  const b0 = px[start + 2]
  const tol = tolerance * tolerance * 3
  const seen = new Uint8Array(w * h)
  const stack: number[] = [sy * w + sx]
  const target = mode === 'remove' ? 0 : 255
  while (stack.length) {
    const idx = stack.pop()!
    if (seen[idx]) continue
    seen[idx] = 1
    const p = idx * 4
    const dr = px[p] - r0
    const dg = px[p + 1] - g0
    const db = px[p + 2] - b0
    if (dr * dr + dg * dg + db * db > tol) continue
    out[idx] = target
    const x = idx % w
    const y = (idx / w) | 0
    if (x > 0) stack.push(idx - 1)
    if (x < w - 1) stack.push(idx + 1)
    if (y > 0) stack.push(idx - w)
    if (y < h - 1) stack.push(idx + w)
  }
  return out
}

/** Weicher Pinsel auf der Maske (Radierer bzw. Wiederherstellen). */
export function paintMask(
  mask: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  value: 0 | 255,
  hardness = 0.7,
) {
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(w - 1, Math.ceil(cx + radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(h - 1, Math.ceil(cy + radius))
  const inner = radius * hardness
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d > radius) continue
      const t = d <= inner ? 1 : 1 - (d - inner) / Math.max(1e-6, radius - inner)
      const i = y * w + x
      mask[i] = Math.round(mask[i] * (1 - t) + value * t)
    }
  }
  return mask
}

/**
 * Räumt eine KI-Maske auf: Kontrast anheben und kleine, abgetrennte Flecken
 * entfernen (typisch für das kleine Modell auf hellem Untergrund). Größere
 * getrennte Teile – z. B. der zweite Schuh eines Paars – bleiben erhalten.
 */
export function cleanMask(mask: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8ClampedArray(mask.length)
  // Kontrast: fast-transparent -> weg, fast-deckend -> voll
  for (let i = 0; i < mask.length; i++) {
    out[i] = Math.max(0, Math.min(255, ((mask[i] - 28) * 255) / (228 - 28)))
  }

  const labels = new Int32Array(mask.length)
  const areas: number[] = [0]
  const stack: number[] = []
  let next = 1
  for (let start = 0; start < out.length; start++) {
    if (out[start] < 128 || labels[start]) continue
    let area = 0
    labels[start] = next
    stack.push(start)
    while (stack.length) {
      const i = stack.pop()!
      area++
      const x = i % w
      const y = (i / w) | 0
      if (x > 0 && !labels[i - 1] && out[i - 1] >= 128) (labels[i - 1] = next), stack.push(i - 1)
      if (x < w - 1 && !labels[i + 1] && out[i + 1] >= 128) (labels[i + 1] = next), stack.push(i + 1)
      if (y > 0 && !labels[i - w] && out[i - w] >= 128) (labels[i - w] = next), stack.push(i - w)
      if (y < h - 1 && !labels[i + w] && out[i + w] >= 128) (labels[i + w] = next), stack.push(i + w)
    }
    areas.push(area)
    next++
  }
  if (next === 1) return out

  const largest = Math.max(...areas)
  const minArea = Math.max(largest * 0.04, w * h * 0.0015)
  const keep = areas.map((a) => a >= minArea)

  // Saum von ein paar Pixeln um die behaltenen Teile: dort dürfen weiche
  // Kantenpixel bleiben, alles Halbtransparente außerhalb ist Rauschen.
  const kept = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) if (labels[i] && keep[labels[i]]) kept[i] = 1
  const near = dilate(kept, w, h, 3)
  for (let i = 0; i < out.length; i++) {
    if (labels[i]) {
      if (!keep[labels[i]]) out[i] = 0
    } else if (!near[i]) {
      out[i] = 0
    }
  }
  return out
}

/** Binäre Dilatation mit quadratischem Fenster (getrennt nach Zeilen/Spalten). */
function dilate(bin: Uint8Array, w: number, h: number, r: number) {
  const tmp = new Uint8Array(bin.length)
  const out = new Uint8Array(bin.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let d = -r; d <= r && !v; d++) {
        const xx = x + d
        if (xx >= 0 && xx < w) v = bin[y * w + xx]
      }
      tmp[y * w + x] = v
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let d = -r; d <= r && !v; d++) {
        const yy = y + d
        if (yy >= 0 && yy < h) v = tmp[yy * w + x]
      }
      out[y * w + x] = v
    }
  }
  return out
}

/** Zieht die Kante leicht ein und weicht sie auf: entfernt den Farbsaum. */
export function refineEdges(mask: Uint8ClampedArray, w: number, h: number, shrink = 1) {
  let m = mask
  for (let s = 0; s < shrink; s++) m = erode(m, w, h)
  return blur(m, w, h, 1)
}

function erode(mask: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8ClampedArray(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let min = mask[i]
      if (x > 0) min = Math.min(min, mask[i - 1])
      if (x < w - 1) min = Math.min(min, mask[i + 1])
      if (y > 0) min = Math.min(min, mask[i - w])
      if (y < h - 1) min = Math.min(min, mask[i + w])
      out[i] = min
    }
  }
  return out
}

function blur(mask: Uint8ClampedArray, w: number, h: number, r: number) {
  const tmp = new Uint8ClampedArray(mask.length)
  const out = new Uint8ClampedArray(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let d = -r; d <= r; d++) {
        const xx = x + d
        if (xx < 0 || xx >= w) continue
        sum += mask[y * w + xx]
        n++
      }
      tmp[y * w + x] = sum / n
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let d = -r; d <= r; d++) {
        const yy = y + d
        if (yy < 0 || yy >= h) continue
        sum += tmp[yy * w + x]
        n++
      }
      out[y * w + x] = sum / n
    }
  }
  return out
}

/** Kachelmuster als Hintergrund für Transparenz. */
export function checkerPattern(ctx: CanvasRenderingContext2D, size = 10) {
  const c = canvasOf(size * 2, size * 2)
  const cc = ctxOf(c)
  cc.fillStyle = '#26262d'
  cc.fillRect(0, 0, size * 2, size * 2)
  cc.fillStyle = '#31313a'
  cc.fillRect(0, 0, size, size)
  cc.fillRect(size, size, size, size)
  return ctx.createPattern(c, 'repeat')!
}

export async function makeThumb(data: ImageData) {
  return canvasToBlob(imageDataToCanvas(resizeImageData(data, MAX_THUMB)), 'image/png')
}

/** Aus fertig freigestellten ImageData ein speicherbares PNG machen. */
export async function toStoredPng(data: ImageData) {
  const cropped = autoCrop(data)
  const sized = resizeImageData(cropped, MAX_STORE)
  return { blob: await canvasToBlob(imageDataToCanvas(sized), 'image/png'), data: sized }
}

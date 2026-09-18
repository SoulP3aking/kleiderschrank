import type { DominantColor } from './types'

export interface Hsl {
  h: number // 0..360
  s: number // 0..1
  l: number // 0..1
}

export function hexToRgb(hex: string) {
  const v = parseInt(hex.replace('#', ''), 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

export function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return { h, s, l }
}

export const hexToHsl = (hex: string) => {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHsl(r, g, b)
}

/**
 * Buntheit 0..1 (max - min). Anders als die HSL-Sättigung bleibt sie bei fast
 * schwarzen/weißen Tönen klein – #030301 ist schwarz, nicht "dunkelgelb".
 */
export const chroma = (hex: string) => {
  const { r, g, b } = hexToRgb(hex)
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
}

/** Schwarz, Weiß oder ein Grauton? */
export const isGray = (hex: string) => {
  const { l } = hexToHsl(hex)
  return chroma(hex) < 0.08 || l < 0.08 || l > 0.94
}

/** Ist die Farbe ein "Allrounder", der zu praktisch allem passt? */
export function isNeutral(hex: string) {
  const { h, s, l } = hexToHsl(hex)
  if (isGray(hex) || s < 0.16) return true // schwarz, weiss, alle Grautoene
  if (l < 0.22) return true // sehr dunkel (z. B. Navy)
  if (h >= 15 && h <= 68 && (s < 0.42 || chroma(hex) < 0.2)) return true // Beige, Camel, Sand, Khaki
  if (h >= 195 && h <= 250 && s < 0.55 && l < 0.45) return true // Denim / Navy
  return false
}

const NAMED: { name: string; h: [number, number]; s?: [number, number]; l?: [number, number] }[] = [
  { name: 'Rot', h: [345, 360] },
  { name: 'Rot', h: [0, 12] },
  { name: 'Koralle', h: [12, 20] },
  { name: 'Orange', h: [20, 38] },
  { name: 'Gelb', h: [38, 66] },
  { name: 'Limette', h: [66, 85] },
  { name: 'Grün', h: [85, 168] },
  { name: 'Türkis', h: [168, 185] },
  { name: 'Petrol', h: [185, 200], l: [0, 0.5] },
  { name: 'Hellblau', h: [185, 200] },
  { name: 'Hellblau', h: [200, 215], l: [0.55, 1] },
  { name: 'Blau', h: [200, 240] },
  { name: 'Indigo', h: [240, 262] },
  { name: 'Violett', h: [262, 290] },
  { name: 'Magenta', h: [290, 320] },
  { name: 'Pink', h: [320, 345] },
]

/** Deutscher Farbname, so wie man ihn im Kleiderschrank benutzt. */
export function colorName(hex: string): string {
  const { h, s, l } = hexToHsl(hex)
  const c = chroma(hex)
  const gray = (): string => {
    if (l < 0.12) return 'Schwarz'
    if (l < 0.3) return 'Anthrazit'
    if (l < 0.55) return 'Grau'
    if (l < 0.85) return 'Hellgrau'
    return 'Weiß'
  }
  if (isGray(hex)) return gray()

  // Warme, gedeckte Töne: das große Feld der Mode-Neutralen (Beige bis Braun, Khaki).
  if (h >= 15 && h <= 68 && (s < 0.42 || c < 0.2)) {
    if (l < 0.26) return 'Dunkelbraun'
    if (l < 0.45) return h > 42 ? 'Oliv' : 'Braun'
    if (l > 0.82) return 'Creme'
    if (l > 0.68) return 'Beige'
    return h > 40 ? 'Khaki' : 'Sand'
  }
  if (h >= 30 && h <= 70 && l > 0.85) return 'Creme'
  if (s < 0.1 || c < 0.1) return gray()
  // Kühle, dunkle, entsättigte Töne wirken als Anthrazit, nicht als Blau.
  if (s < 0.25 && l < 0.35) return 'Anthrazit'

  if (h >= 15 && h <= 50) {
    if (l < 0.26) return 'Dunkelbraun'
    if (s < 0.55 && l < 0.5) return 'Braun'
    if (l < 0.42) return 'Cognac'
    if (l > 0.6) return 'Apricot'
  }
  if (h >= 60 && h <= 110 && s < 0.45 && l < 0.5) return 'Oliv'
  if (h >= 200 && h <= 250 && l < 0.3) return 'Navy'
  if (h >= 330 || h <= 15) {
    if (l < 0.28) return 'Bordeaux'
    if (l > 0.7 && s < 0.85) return 'Rosé'
  }
  if (h >= 38 && h <= 55 && s > 0.6 && l < 0.5) return 'Senf'
  const base = NAMED.find(
    (n) =>
      h >= n.h[0] &&
      h < n.h[1] &&
      (!n.l || (l >= n.l[0] && l <= n.l[1])) &&
      (!n.s || (s >= n.s[0] && s <= n.s[1])),
  )
  const name = base?.name ?? 'Bunt'
  if (l < 0.28) return 'Dunkel' + name.toLowerCase()
  if (l > 0.75) return 'Hell' + name.toLowerCase()
  return name
}

/* sRGB -> CIE-Lab: dort entsprechen Abstände dem, was das Auge als "anders" wahrnimmt. */
function toLinear(c: number) {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = toLinear(r)
  const G = toLinear(g)
  const B = toLinear(b)
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047)
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722)
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/**
 * Dominante Farben aus einem freigestellten Bild per k-Means im Lab-Raum.
 * Nur deckende Pixel zählen – halbtransparente Kanten würden sonst den
 * Hintergrund mit hineinmischen. Die Anteile ergeben zusammen 100 %.
 */
export function dominantColors(data: ImageData, max = 4): DominantColor[] {
  const px = data.data
  const opaque: number[] = []
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] >= 200) opaque.push(i)
  if (!opaque.length) return [{ hex: '#888888', ratio: 1 }]

  // Stichprobe reicht völlig und hält es auch bei großen Fotos schnell.
  const step = Math.max(1, Math.floor(opaque.length / 6000))
  const samples: { lab: [number, number, number]; rgb: [number, number, number] }[] = []
  for (let k = 0; k < opaque.length; k += step) {
    const i = opaque[k]
    samples.push({ lab: rgbToLab(px[i], px[i + 1], px[i + 2]), rgb: [px[i], px[i + 1], px[i + 2]] })
  }

  const dist2 = (a: number[], b: number[]) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

  // k-means++ mit festem Startwert -> gleiches Bild, gleiches Ergebnis.
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const k = Math.min(6, samples.length)
  const centers: number[][] = [samples[Math.floor(rand() * samples.length)].lab.slice()]
  while (centers.length < k) {
    const d = samples.map((s) => Math.min(...centers.map((c) => dist2(s.lab, c))))
    const sum = d.reduce((a, b) => a + b, 0)
    if (!sum) break
    let r = rand() * sum
    let idx = 0
    while (r > d[idx] && idx < d.length - 1) r -= d[idx++]
    centers.push(samples[idx].lab.slice())
  }

  const assign = new Int32Array(samples.length)
  for (let iter = 0; iter < 14; iter++) {
    let moved = false
    samples.forEach((s, si) => {
      let best = 0
      let bestD = Infinity
      centers.forEach((c, ci) => {
        const dd = dist2(s.lab, c)
        if (dd < bestD) (bestD = dd), (best = ci)
      })
      if (assign[si] !== best) (assign[si] = best), (moved = true)
    })
    const acc = centers.map(() => [0, 0, 0, 0])
    samples.forEach((s, si) => {
      const a = acc[assign[si]]
      a[0] += s.lab[0]
      a[1] += s.lab[1]
      a[2] += s.lab[2]
      a[3]++
    })
    acc.forEach((a, ci) => a[3] && (centers[ci] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]))
    if (!moved && iter > 0) break
  }

  // Cluster auswerten; Farbe = Mittelwert der echten RGB-Werte (nicht zurückgerechnet).
  type Cluster = { n: number; r: number; g: number; b: number; lab: number[] }
  let clusters: Cluster[] = centers.map((lab) => ({ n: 0, r: 0, g: 0, b: 0, lab }))
  samples.forEach((s, si) => {
    const c = clusters[assign[si]]
    c.n++
    c.r += s.rgb[0]
    c.g += s.rgb[1]
    c.b += s.rgb[2]
  })
  clusters = clusters.filter((c) => c.n).sort((a, b) => b.n - a.n)

  // Sehr ähnliche Cluster zusammenlegen (z. B. Licht- und Schattenseite desselben Blaus).
  const merged: Cluster[] = []
  for (const c of clusters) {
    const twin = merged.find((m) => dist2(m.lab, c.lab) < 14 * 14)
    if (twin) {
      twin.n += c.n
      twin.r += c.r
      twin.g += c.g
      twin.b += c.b
    } else merged.push({ ...c })
  }
  merged.sort((a, b) => b.n - a.n)

  const total = samples.length
  return merged
    .filter((c, i) => i === 0 || c.n / total >= 0.05)
    .slice(0, max)
    .map((c) => ({ hex: rgbToHex(c.r / c.n, c.g / c.n, c.b / c.n), ratio: c.n / total }))
}

/** Wahrgenommener Abstand zweier Farben (gewichtetes RGB, 0..~120). */
export function colorDistance(a: string, b: string) {
  const c1 = hexToRgb(a)
  const c2 = hexToRgb(b)
  const rm = (c1.r + c2.r) / 2
  const dr = c1.r - c2.r
  const dg = c1.g - c2.g
  const db = c1.b - c2.b
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 4
}

export type HarmonyKind =
  | 'neutral'
  | 'monochrom'
  | 'analog'
  | 'komplementär'
  | 'triade'
  | 'erdtöne'
  | 'kontrast'
  | 'unruhig'

export interface HarmonyResult {
  kind: HarmonyKind
  score: number
  label: string
}

const hueDelta = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

const isEarth = (hex: string) => {
  const { h, s, l } = hexToHsl(hex)
  return h >= 15 && h <= 110 && s >= 0.12 && s <= 0.6 && l >= 0.12 && l <= 0.75
}

/** Bewertet, wie gut zwei Farben zusammen aussehen. */
export function harmony(a: string, b: string): HarmonyResult {
  const A = hexToHsl(a)
  const B = hexToHsl(b)
  const na = isNeutral(a)
  const nb = isNeutral(b)

  if (na && nb) {
    const dl = Math.abs(A.l - B.l)
    if (dl > 0.35) return { kind: 'kontrast', score: 0.92, label: 'Hell-Dunkel-Kontrast' }
    if (dl < 0.1) return { kind: 'neutral', score: 0.7, label: 'Ton in Ton (neutral)' }
    return { kind: 'neutral', score: 0.85, label: 'Neutral kombiniert' }
  }
  if (na || nb) return { kind: 'neutral', score: 0.9, label: 'Neutral + Akzent' }

  const d = hueDelta(A.h, B.h)
  if (isEarth(a) && isEarth(b)) return { kind: 'erdtöne', score: 0.88, label: 'Erdtöne' }
  if (d < 18) {
    const dl = Math.abs(A.l - B.l)
    return dl > 0.18
      ? { kind: 'monochrom', score: 0.86, label: 'Ton in Ton' }
      : { kind: 'monochrom', score: 0.62, label: 'Sehr ähnliche Farben' }
  }
  if (d < 50) return { kind: 'analog', score: 0.84, label: 'Analoge Farben' }
  if (d >= 150) return { kind: 'komplementär', score: 0.8, label: 'Komplementärkontrast' }
  if (d >= 105 && d < 135) return { kind: 'triade', score: 0.72, label: 'Triade' }
  return { kind: 'unruhig', score: 0.34, label: 'Farben beißen sich' }
}

/** Lesbare Textfarbe auf einem farbigen Hintergrund. */
export function textOn(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#111' : '#fff'
}

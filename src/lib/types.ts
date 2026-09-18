/** Alle Datentypen des Kleiderschranks. Nichts davon verlaesst jemals das Geraet. */

/** Ebene am Koerper, auf der ein Teil sitzt. Bestimmt Standardposition + Stapelreihenfolge. */
export type Slot =
  | 'kopf'
  | 'oberteil'
  | 'ueberzieher'
  | 'unterteil'
  | 'einteiler'
  | 'schuhe'
  | 'accessoire'

export type Season = 'Frühling' | 'Sommer' | 'Herbst' | 'Winter'
export type Style = 'Casual' | 'Business' | 'Elegant' | 'Sport' | 'Streetwear'
export type Pattern = 'Uni' | 'Gemustert' | 'Gestreift' | 'Kariert' | 'Geblümt'
export type View = 'front' | 'back'

export const SEASONS: Season[] = ['Frühling', 'Sommer', 'Herbst', 'Winter']
export const STYLES: Style[] = ['Casual', 'Business', 'Elegant', 'Sport', 'Streetwear']
export const PATTERNS: Pattern[] = ['Uni', 'Gemustert', 'Gestreift', 'Kariert', 'Geblümt']

export const SLOT_LABEL: Record<Slot, string> = {
  kopf: 'Kopf',
  ueberzieher: 'Jacke / Überzieher',
  oberteil: 'Oberteil',
  einteiler: 'Kleid / Einteiler',
  unterteil: 'Unterteil',
  schuhe: 'Schuhe',
  accessoire: 'Accessoire',
}

/** Reihenfolge, in der die Slots in Listen/Regalen auftauchen. */
export const SLOT_ORDER: Slot[] = [
  'kopf',
  'ueberzieher',
  'oberteil',
  'einteiler',
  'unterteil',
  'schuhe',
  'accessoire',
]

/** Kategorie -> Slot. Die Kategorie ist das, was die KI erkennt bzw. du auswaehlst. */
export const CATEGORIES: { name: string; slot: Slot }[] = [
  { name: 'T-Shirt', slot: 'oberteil' },
  { name: 'Hemd', slot: 'oberteil' },
  { name: 'Bluse', slot: 'oberteil' },
  { name: 'Top', slot: 'oberteil' },
  { name: 'Pullover', slot: 'oberteil' },
  { name: 'Hoodie', slot: 'oberteil' },
  { name: 'Sweatshirt', slot: 'oberteil' },
  { name: 'Longsleeve', slot: 'oberteil' },
  { name: 'Jacke', slot: 'ueberzieher' },
  { name: 'Mantel', slot: 'ueberzieher' },
  { name: 'Blazer', slot: 'ueberzieher' },
  { name: 'Weste', slot: 'ueberzieher' },
  { name: 'Cardigan', slot: 'ueberzieher' },
  { name: 'Jeans', slot: 'unterteil' },
  { name: 'Hose', slot: 'unterteil' },
  { name: 'Chino', slot: 'unterteil' },
  { name: 'Shorts', slot: 'unterteil' },
  { name: 'Jogginghose', slot: 'unterteil' },
  { name: 'Rock', slot: 'unterteil' },
  { name: 'Kleid', slot: 'einteiler' },
  { name: 'Overall', slot: 'einteiler' },
  { name: 'Anzug', slot: 'einteiler' },
  { name: 'Sneaker', slot: 'schuhe' },
  { name: 'Schuhe', slot: 'schuhe' },
  { name: 'Stiefel', slot: 'schuhe' },
  { name: 'Sandalen', slot: 'schuhe' },
  { name: 'Mütze', slot: 'kopf' },
  { name: 'Cap', slot: 'kopf' },
  { name: 'Hut', slot: 'kopf' },
  { name: 'Schal', slot: 'accessoire' },
  { name: 'Gürtel', slot: 'accessoire' },
  { name: 'Krawatte', slot: 'accessoire' },
  { name: 'Tasche', slot: 'accessoire' },
  { name: 'Brille', slot: 'accessoire' },
  { name: 'Uhr', slot: 'accessoire' },
  { name: 'Schmuck', slot: 'accessoire' },
]

export const slotOf = (category: string): Slot =>
  CATEGORIES.find((c) => c.name === category)?.slot ?? 'accessoire'

/** Position eines Teils auf der Figur. x/y = Mittelpunkt in 0..1 der Figurflaeche. */
export interface Placement {
  x: number
  y: number
  /** Breite des Bildes relativ zur Figurbreite (1 = so breit wie die Figur). */
  scale: number
  /** Grad. */
  rotation: number
  /** Feinjustierung der Stapelreihenfolge relativ zum Slot. */
  zOffset: number
  /** Horizontal gespiegelt. */
  flip: boolean
}

export interface DominantColor {
  hex: string
  ratio: number
}

export interface Item {
  id: string
  name: string
  category: string
  slot: Slot
  /** Bis zu 4 dominante Farben, nach Anteil sortiert. */
  colors: DominantColor[]
  /** Deutscher Farbname der Hauptfarbe, z. B. "Petrol". */
  colorName: string
  seasons: Season[]
  styles: Style[]
  pattern: Pattern
  brand: string
  notes: string
  favorite: boolean
  createdAt: number
  wearCount: number
  lastWorn: number | null
  /** Schluessel in der Bild-Ablage. */
  imageFront: string | null
  imageBack: string | null
  thumb: string | null
  /** Seitenverhältnis (Breite/Höhe) der Bilder – für die Startposition auf der Figur. */
  aspect: number
  aspectBack: number | null
  placement: Record<View, Placement>
}

export interface Outfit {
  id: string
  name: string
  itemIds: string[]
  createdAt: number
  favorite: boolean
  note: string
  /** Vorschaubild (Schluessel in der Bild-Ablage). */
  cover: string | null
}

/** Ein Tag im Kalender. date = "YYYY-MM-DD". */
export interface PlanEntry {
  date: string
  outfitId: string | null
  itemIds: string[]
  worn: boolean
  note: string
}

export interface Figure {
  mode: 'silhouette' | 'foto'
  shape: 'neutral' | 'weiblich' | 'männlich'
  skin: string
  /** 0.9 .. 1.12 */
  height: number
  /** 0.85 .. 1.2 */
  width: number
  photoFront: string | null
  photoBack: string | null
  photoOpacity: number
}

/**
 * Freisteller-Modell:
 *  auto    – mit WebGPU fp16 (84 MB, schnell + sauber), sonst q8 (42 MB)
 *  schnell – immer q8 (42 MB), kleinster Download
 *  gut     – fp16 (WebGPU) bzw. fp32 (168 MB) ohne WebGPU
 */
export type AiQuality = 'auto' | 'schnell' | 'gut'

export interface Settings {
  figure: Figure
  aiQuality: AiQuality
  aiAutoRun: boolean
  aiClassify: boolean
  onboarded: boolean
}

export const DEFAULT_FIGURE: Figure = {
  mode: 'silhouette',
  shape: 'neutral',
  skin: '#d9a377',
  height: 1,
  width: 1,
  photoFront: null,
  photoBack: null,
  photoOpacity: 1,
}

export const DEFAULT_SETTINGS: Settings = {
  figure: DEFAULT_FIGURE,
  aiQuality: 'auto',
  aiAutoRun: true,
  aiClassify: true,
  onboarded: false,
}

/** Stapelreihenfolge auf der Figur (klein = weiter hinten). */
export const SLOT_Z: Record<Slot, number> = {
  schuhe: 10,
  einteiler: 20,
  unterteil: 30,
  oberteil: 40,
  ueberzieher: 50,
  kopf: 60,
  accessoire: 70,
}

/**
 * Körperzone je Ebene, normiert auf die Bühne (x/w: Anteil der Breite,
 * top/bottom: Anteil der Höhe). Passend zur Silhouette: Halsansatz ~0.14,
 * Taille ~0.40, Knöchel ~0.94.
 */
interface SlotZone {
  x: number
  top: number
  bottom: number
  w: number
  align: 'top' | 'center' | 'bottom'
}

const SLOT_ZONE: Record<Slot, SlotZone> = {
  kopf: { x: 0.5, top: 0.012, bottom: 0.11, w: 0.3, align: 'top' },
  oberteil: { x: 0.5, top: 0.132, bottom: 0.53, w: 0.74, align: 'top' },
  ueberzieher: { x: 0.5, top: 0.128, bottom: 0.58, w: 0.82, align: 'top' },
  einteiler: { x: 0.5, top: 0.132, bottom: 0.8, w: 0.66, align: 'top' },
  unterteil: { x: 0.5, top: 0.39, bottom: 0.955, w: 0.52, align: 'top' },
  schuhe: { x: 0.5, top: 0.9, bottom: 0.99, w: 0.44, align: 'bottom' },
  accessoire: { x: 0.5, top: 0.2, bottom: 0.34, w: 0.26, align: 'center' },
}

/** Bühne ist doppelt so hoch wie breit. */
const STAGE_H_PER_W = 2

/**
 * Startposition: Bild so groß wie möglich in die Körperzone einpassen, ohne
 * sie zu verlassen – eine Hose mit gespreizten Beinen wird also über die
 * Breite begrenzt, eine schmale lange über die Höhe. Oben bündig (Kragen am
 * Hals, Bund an der Taille), Schuhe unten bündig.
 */
export function fitPlacement(slot: Slot, aspect: number): Placement {
  const z = SLOT_ZONE[slot]
  const a = aspect > 0 ? aspect : 1
  const zoneH = z.bottom - z.top
  const scale = Math.min(z.w, zoneH * STAGE_H_PER_W * a)
  const hFrac = scale / a / STAGE_H_PER_W
  const y =
    z.align === 'top'
      ? z.top + hFrac / 2
      : z.align === 'bottom'
        ? z.bottom - hFrac / 2
        : (z.top + z.bottom) / 2
  return { x: z.x, y, scale, rotation: 0, zOffset: 0, flip: false }
}

export const newPlacement = (
  slot: Slot,
  aspect = 1,
  aspectBack: number | null = null,
): Record<View, Placement> => ({
  front: fitPlacement(slot, aspect),
  back: fitPlacement(slot, aspectBack ?? aspect),
})

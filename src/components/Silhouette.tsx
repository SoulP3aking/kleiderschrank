import { useMemo } from 'react'
import type { Figure, View } from '../lib/types'

/**
 * Neutrale Mannequin-Silhouette als SVG-String – eine einzige Quelle für
 * Anzeige und PNG-Export, damit das exportierte Bild exakt dem entspricht,
 * was du auf dem Bildschirm siehst.
 * Koordinatensystem: 500 x 1000, identisch zur Ankleide-Fläche.
 */

const CX = 250

interface Body {
  shoulder: number
  waist: number
  hip: number
  headRx: number
  headRy: number
  armW: number
  thighW: number
}

function bodyOf(figure: Figure): Body {
  const w = figure.width
  const base: Record<Figure['shape'], Body> = {
    männlich: { shoulder: 112, waist: 80, hip: 86, headRx: 41, headRy: 51, armW: 21, thighW: 45 },
    neutral: { shoulder: 100, waist: 72, hip: 88, headRx: 39, headRy: 49, armW: 19, thighW: 44 },
    weiblich: { shoulder: 88, waist: 62, hip: 96, headRx: 37, headRy: 48, armW: 16, thighW: 43 },
  }
  const b = base[figure.shape]
  return {
    shoulder: b.shoulder * w,
    waist: b.waist * w,
    hip: b.hip * w,
    headRx: b.headRx * (0.5 + w * 0.5),
    headRy: b.headRy * (0.5 + w * 0.5),
    armW: b.armW * w,
    thighW: b.thighW * w,
  }
}

/** Gliedmaße als Kapsel zwischen zwei Punkten mit unterschiedlicher Dicke. */
function limb(x1: number, y1: number, w1: number, x2: number, y2: number, w2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const p = (x: number, y: number, w: number, s: number) =>
    `${(x + nx * w * s).toFixed(2)},${(y + ny * w * s).toFixed(2)}`
  // sweep-flag 0: die Kappen wölben sich nach außen. Mit 1 wären sie nach innen
  // gewölbt und würden Löcher in die Füllung stanzen (sichtbar als dunkle Kreise).
  return [
    `M ${p(x1, y1, w1, -1)}`,
    `A ${w1.toFixed(2)} ${w1.toFixed(2)} 0 0 0 ${p(x1, y1, w1, 1)}`,
    `L ${p(x2, y2, w2, 1)}`,
    `A ${w2.toFixed(2)} ${w2.toFixed(2)} 0 0 0 ${p(x2, y2, w2, -1)}`,
    'Z',
  ].join(' ')
}

const Y = {
  headMid: 74,
  neck: 124,
  shoulder: 168,
  chest: 250,
  waist: 402,
  hip: 486,
  crotch: 528,
  wrist: 570,
  knee: 742,
  ankle: 936,
  sole: 968,
}

export function silhouetteMarkup(figure: Figure, view: View) {
  const b = bodyOf(figure)
  const torso = [
    `M ${CX - b.shoulder * 0.42} ${Y.shoulder - 26}`,
    `C ${CX - b.shoulder * 0.9} ${Y.shoulder - 22}, ${CX - b.shoulder} ${Y.shoulder - 4}, ${CX - b.shoulder} ${Y.shoulder + 14}`,
    `C ${CX - b.shoulder} ${Y.chest}, ${CX - b.waist - 6} ${Y.waist - 70}, ${CX - b.waist} ${Y.waist}`,
    `C ${CX - b.waist - 4} ${Y.waist + 44}, ${CX - b.hip} ${Y.hip - 40}, ${CX - b.hip} ${Y.hip}`,
    `C ${CX - b.hip} ${Y.hip + 30}, ${CX - b.hip * 0.86} ${Y.crotch}, ${CX - b.hip * 0.8} ${Y.crotch + 8}`,
    `L ${CX + b.hip * 0.8} ${Y.crotch + 8}`,
    `C ${CX + b.hip * 0.86} ${Y.crotch}, ${CX + b.hip} ${Y.hip + 30}, ${CX + b.hip} ${Y.hip}`,
    `C ${CX + b.hip} ${Y.hip - 40}, ${CX + b.waist + 4} ${Y.waist + 44}, ${CX + b.waist} ${Y.waist}`,
    `C ${CX + b.waist + 6} ${Y.waist - 70}, ${CX + b.shoulder} ${Y.chest}, ${CX + b.shoulder} ${Y.shoulder + 14}`,
    `C ${CX + b.shoulder} ${Y.shoulder - 4}, ${CX + b.shoulder * 0.9} ${Y.shoulder - 22}, ${CX + b.shoulder * 0.42} ${Y.shoulder - 26}`,
    'Z',
  ].join(' ')

  const armX = b.shoulder - b.armW * 0.5
  const arms = [
    limb(CX - armX, Y.shoulder, b.armW + 3, CX - armX - 14, Y.wrist, b.armW - 5),
    limb(CX + armX, Y.shoulder, b.armW + 3, CX + armX + 14, Y.wrist, b.armW - 5),
  ]

  const legGap = b.hip * 0.34
  const legs = [
    limb(CX - legGap, Y.crotch - 10, b.thighW, CX - legGap * 0.92, Y.knee, b.thighW * 0.66),
    limb(CX - legGap * 0.92, Y.knee, b.thighW * 0.66, CX - legGap * 0.9, Y.ankle, b.thighW * 0.42),
    limb(CX + legGap, Y.crotch - 10, b.thighW, CX + legGap * 0.92, Y.knee, b.thighW * 0.66),
    limb(CX + legGap * 0.92, Y.knee, b.thighW * 0.66, CX + legGap * 0.9, Y.ankle, b.thighW * 0.42),
  ]

  const paths = [
    `<rect x="${CX - b.headRx * 0.42}" y="${Y.neck - 22}" width="${b.headRx * 0.84}" height="62" rx="${b.headRx * 0.32}"/>`,
    `<path d="${torso}"/>`,
    ...arms.map((d) => `<path d="${d}"/>`),
    ...legs.map((d) => `<path d="${d}"/>`),
    `<ellipse cx="${CX}" cy="${Y.headMid}" rx="${b.headRx}" ry="${b.headRy}"/>`,
    `<ellipse cx="${CX - legGap * 0.9}" cy="${Y.sole}" rx="${b.thighW * 0.46}" ry="16"/>`,
    `<ellipse cx="${CX + legGap * 0.9}" cy="${Y.sole}" rx="${b.thighW * 0.46}" ry="16"/>`,
  ].join('')

  const shade = `<g fill="url(#sh)"><path d="${torso}"/><ellipse cx="${CX}" cy="${Y.headMid}" rx="${b.headRx}" ry="${b.headRy}"/></g>`
  const spine =
    view === 'back'
      ? `<path d="M ${CX} ${Y.shoulder + 10} L ${CX} ${Y.waist + 40}" stroke="#000" stroke-opacity="0.12" stroke-width="3" fill="none" stroke-linecap="round"/>`
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 1000" width="500" height="1000"><defs><linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#000" stop-opacity="0.16"/><stop offset="28%" stop-color="#000" stop-opacity="0"/><stop offset="72%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.2"/></linearGradient></defs><g transform="translate(0 1000) scale(1 ${figure.height}) translate(0 -1000)"><g fill="${figure.skin}">${paths}</g>${shade}${spine}</g></svg>`
}

export const silhouetteDataUrl = (figure: Figure, view: View) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(silhouetteMarkup(figure, view))

export function Silhouette({ figure, view }: { figure: Figure; view: View }) {
  const src = useMemo(() => silhouetteDataUrl(figure, view), [figure, view])
  return (
    <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
  )
}

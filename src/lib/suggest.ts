/**
 * Outfit-Vorschläge. Rein regelbasiert und komplett offline: Farbharmonie,
 * Musterbalance, Stil, Saison und wann du ein Teil zuletzt anhattest.
 */
import { harmony, isNeutral } from './color'
import type { Item, Season, Style } from './types'

export interface Suggestion {
  id: string
  itemIds: string[]
  score: number
  reasons: string[]
}

export interface SuggestOptions {
  season?: Season | null
  style?: Style | null
  /** Dieses Teil muss im Outfit vorkommen. */
  anchorId?: string | null
  /** Sorgt für neue Vorschläge beim nochmaligen Würfeln. */
  seed?: number
  limit?: number
  /** Teile, die in den letzten n Tagen getragen wurden, werden abgewertet. */
  freshDays?: number
}

const mainColor = (i: Item) => i.colors[0]?.hex ?? '#888888'

/** Kleiner, reproduzierbarer Zufallsgenerator – gleicher Seed, gleiche Vorschläge. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

function shuffled<T>(arr: T[], rand: () => number) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function matchesFilter(item: Item, opts: SuggestOptions) {
  if (opts.season && item.seasons.length && !item.seasons.includes(opts.season)) return false
  if (opts.style && item.styles.length && !item.styles.includes(opts.style)) return false
  return true
}

/** Abzug für Teile, die du gerade erst anhattest – und ein kleiner Bonus für Ladenhüter. */
function freshness(item: Item, freshDays: number) {
  if (!item.lastWorn) return 0.06
  const days = (Date.now() - item.lastWorn) / 86400000
  if (days < 2) return -0.35
  if (days < freshDays) return -0.18 * (1 - days / freshDays)
  if (days > 90) return 0.08
  return 0
}

function patternScore(items: Item[]) {
  const loud = items.filter((i) => i.pattern !== 'Uni')
  if (loud.length === 0) return { delta: 0, reason: null as string | null }
  if (loud.length === 1) return { delta: 0.06, reason: `${loud[0].name} als Blickfang` }
  if (loud.length === 2 && loud[0].pattern === loud[1].pattern)
    return { delta: -0.18, reason: null }
  return { delta: -0.3, reason: null }
}

function colorBalance(items: Item[]) {
  const loud = items.filter((i) => !isNeutral(mainColor(i)))
  if (loud.length === 0) return { delta: 0.04, reason: 'Komplett neutral gehalten' }
  if (loud.length === 1) return { delta: 0.12, reason: `${loud[0].colorName} als einziger Akzent` }
  if (loud.length === 2) return { delta: 0, reason: null }
  return { delta: -0.12 * (loud.length - 2), reason: null }
}

function styleScore(items: Item[]) {
  const withStyle = items.filter((i) => i.styles.length)
  if (withStyle.length < 2) return { delta: 0, reason: null as string | null }
  const common = withStyle
    .map((i) => i.styles)
    .reduce((a, b) => a.filter((s) => b.includes(s)))
  if (common.length) return { delta: 0.14, reason: `Durchgehend ${common[0]}` }
  const hasSport = withStyle.some((i) => i.styles.includes('Sport'))
  const hasFormal = withStyle.some(
    (i) => i.styles.includes('Business') || i.styles.includes('Elegant'),
  )
  if (hasSport && hasFormal) return { delta: -0.3, reason: null }
  return { delta: -0.05, reason: null }
}

/** Bewertet eine fertige Kombination. */
function scoreOutfit(items: Item[], opts: Required<Pick<SuggestOptions, 'freshDays'>>) {
  const reasons: string[] = []
  let score = 0
  let pairs = 0

  // Farbpaare gewichtet: Oberteil/Unterteil zählt am meisten.
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const w =
        (items[a].slot === 'oberteil' && items[b].slot === 'unterteil') ||
        (items[a].slot === 'unterteil' && items[b].slot === 'oberteil')
          ? 2
          : 1
      const h = harmony(mainColor(items[a]), mainColor(items[b]))
      score += h.score * w
      pairs += w
      if (w === 2 && h.score >= 0.78) reasons.push(h.label)
      if (h.kind === 'unruhig') score -= 0.25
    }
  }
  score = pairs ? score / pairs : 0.5

  const cb = colorBalance(items)
  score += cb.delta
  if (cb.reason) reasons.push(cb.reason)

  const ps = patternScore(items)
  score += ps.delta
  if (ps.reason) reasons.push(ps.reason)

  const ss = styleScore(items)
  score += ss.delta
  if (ss.reason) reasons.push(ss.reason)

  score += items.reduce((s, i) => s + freshness(i, opts.freshDays), 0) / items.length
  score += items.filter((i) => i.favorite).length * 0.04

  // Vollständigkeit: mit Schuhen ist es ein echtes Outfit.
  if (items.some((i) => i.slot === 'schuhe')) {
    score += 0.05
  } else {
    score -= 0.12
    reasons.push('Schuhe fehlen noch')
  }

  return { score, reasons: [...new Set(reasons)].slice(0, 3) }
}

export function suggestOutfits(all: Item[], opts: SuggestOptions = {}): Suggestion[] {
  const limit = opts.limit ?? 12
  const freshDays = opts.freshDays ?? 10
  const rand = rng(opts.seed ?? 1)
  const anchor = opts.anchorId ? all.find((i) => i.id === opts.anchorId) ?? null : null

  const pool = all.filter((i) => matchesFilter(i, opts) || i.id === anchor?.id)
  const bySlot = (slot: Item['slot']) => shuffled(pool.filter((i) => i.slot === slot), rand)

  const tops = bySlot('oberteil').slice(0, 50)
  const bottoms = bySlot('unterteil').slice(0, 50)
  const onepieces = bySlot('einteiler').slice(0, 25)
  const shoes = bySlot('schuhe').slice(0, 20)
  const outers = bySlot('ueberzieher').slice(0, 20)
  // Kopfbedeckungen und Accessoires kommen nur dazu, wenn sie das Outfit aufwerten.
  const extras = shuffled([...bySlot('accessoire'), ...bySlot('kopf')], rand).slice(0, 20)

  // Schritt 1: Basis (Oberteil+Unterteil bzw. Einteiler) vorsortieren.
  type Base = { items: Item[]; score: number; reasons: string[] }
  const bases: Base[] = []
  for (const top of tops) {
    for (const bottom of bottoms) {
      const items = [top, bottom]
      if (anchor && anchor.slot !== 'schuhe' && anchor.slot !== 'ueberzieher' &&
          anchor.slot !== 'accessoire' && anchor.slot !== 'kopf' &&
          !items.some((i) => i.id === anchor.id)) continue
      const h = harmony(mainColor(top), mainColor(bottom))
      if (h.kind === 'unruhig') continue
      bases.push({ items, score: h.score, reasons: [h.label] })
    }
  }
  for (const one of onepieces) {
    if (anchor && anchor.slot === 'oberteil') continue
    if (anchor && anchor.slot === 'unterteil') continue
    if (anchor && anchor.slot === 'einteiler' && one.id !== anchor.id) continue
    bases.push({ items: [one], score: 0.8, reasons: ['Einteiler'] })
  }
  bases.sort((a, b) => b.score - a.score)
  const shortlist = bases.slice(0, 160)

  // Schritt 2: Schuhe, Jacke und Accessoire dazustellen und bewerten.
  const out: Suggestion[] = []
  const seen = new Set<string>()
  for (const base of shortlist) {
    // Sind die Schuhe vorgegeben, nur diese – sonst eine Auswahl durchprobieren.
    const shoeOptions =
      anchor?.slot === 'schuhe' ? [anchor] : shoes.length ? shoes.slice(0, 6) : [null]
    for (const shoe of shoeOptions) {
      const items = shoe ? [...base.items, shoe] : [...base.items]

      // Jacke nur dazu, wenn sie die Kombination nicht verschlechtert.
      let best: { items: Item[]; score: number; reasons: string[] } = {
        items,
        ...scoreOutfit(items, { freshDays }),
      }
      for (const outer of outers.slice(0, 5)) {
        const withOuter = [...items, outer]
        const s = scoreOutfit(withOuter, { freshDays })
        if (s.score > best.score + 0.02) best = { items: withOuter, ...s }
      }
      if (anchor && anchor.slot === 'ueberzieher' && !best.items.some((i) => i.id === anchor.id)) {
        best = { items: [...items, anchor], ...scoreOutfit([...items, anchor], { freshDays }) }
      }
      for (const extra of extras.slice(0, 4)) {
        if (extra.slot === 'kopf' && best.items.some((i) => i.slot === 'kopf')) continue
        const withExtra = [...best.items, extra]
        const s = scoreOutfit(withExtra, { freshDays })
        if (s.score > best.score + 0.03) best = { items: withExtra, ...s }
      }
      if (
        anchor &&
        (anchor.slot === 'accessoire' || anchor.slot === 'kopf') &&
        !best.items.some((i) => i.id === anchor.id)
      ) {
        best = {
          items: [...best.items, anchor],
          ...scoreOutfit([...best.items, anchor], { freshDays }),
        }
      }

      const ids = best.items.map((i) => i.id).sort()
      const key = ids.join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: key,
        itemIds: best.items.map((i) => i.id),
        score: best.score + rand() * 0.02,
        reasons: [...new Set([...base.reasons, ...best.reasons])].slice(0, 3),
      })
    }
  }

  out.sort((a, b) => b.score - a.score)

  // Für Abwechslung sorgen: kein Teil soll in jedem Vorschlag auftauchen.
  const used = new Map<string, number>()
  const picked: Suggestion[] = []
  for (const s of out) {
    if (picked.length >= limit) break
    const over = s.itemIds.some((id) => (used.get(id) ?? 0) >= 3 && id !== anchor?.id)
    if (over) continue
    s.itemIds.forEach((id) => used.set(id, (used.get(id) ?? 0) + 1))
    picked.push(s)
  }
  return picked.length ? picked : out.slice(0, limit)
}

/** Was fehlt dem Schrank, damit Vorschläge überhaupt Sinn ergeben? */
export function missingForSuggestions(items: Item[]) {
  const has = (slot: Item['slot']) => items.some((i) => i.slot === slot)
  const missing: string[] = []
  if (!has('oberteil') && !has('einteiler')) missing.push('ein Oberteil')
  if (!has('unterteil') && !has('einteiler')) missing.push('ein Unterteil')
  if (!has('schuhe')) missing.push('ein Paar Schuhe')
  return missing
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useImageUrl } from '../lib/imageUrls'
import { alphaMapFor, hitsLayer, imageKeyFor, layerBox, sortedLayers } from '../lib/stage'
import type { Figure, Item, Placement, View } from '../lib/types'
import { Silhouette } from './Silhouette'

interface Props {
  items: Item[]
  view: View
  figure: Figure
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onPlacementChange?: (id: string, patch: Partial<Placement>) => Promise<void> | void
  editable?: boolean
  className?: string
}

interface Gesture {
  id: string
  start: Placement
  /** Bühnenkoordinaten beim Start. */
  px: number
  py: number
  dist: number
  angle: number
  moved: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function Layer({
  item,
  view,
  selected,
  stageW,
  stageH,
  placement,
  editable,
}: {
  item: Item
  view: View
  selected: boolean
  stageW: number
  stageH: number
  placement: Placement
  editable: boolean
}) {
  const key = imageKeyFor(item, view)
  const url = useImageUrl(key)
  const [aspect, setAspect] = useState(1)
  if (!url || !key) return null
  const box = layerBox(placement, stageW, stageH, aspect)
  const missingBack = view === 'back' && !item.imageBack
  return (
    <div
      className="pointer-events-none absolute will-change-transform"
      style={{
        left: box.cx,
        top: box.cy,
        width: box.w,
        height: box.h,
        transform: `translate(-50%, -50%) rotate(${box.rot}deg) scaleX(${box.flip ? -1 : 1})`,
      }}
    >
      <img
        src={url}
        alt={item.name}
        draggable={false}
        onLoad={(e) => {
          const el = e.currentTarget
          setAspect(el.naturalWidth / el.naturalHeight)
        }}
        className="h-full w-full select-none object-contain"
        style={{
          opacity: missingBack ? 0.45 : 1,
          filter: selected && editable ? 'drop-shadow(0 0 0 rgba(0,0,0,0))' : undefined,
        }}
      />
      {selected && editable && (
        <div className="absolute inset-0 rounded-sm border-2 border-dashed border-sky-300/80" />
      )}
    </div>
  )
}

export function FigureStage({
  items,
  view,
  figure,
  selectedId = null,
  onSelect,
  onPlacementChange,
  editable = false,
  className = '',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Innere Figurfläche: immer genau 1:2, zentriert – egal wie groß der Platz außen ist.
  const [size, setSize] = useState({ w: 0, h: 0, x: 0, y: 0 })
  const [draft, setDraft] = useState<{ id: string; placement: Placement } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<Gesture | null>(null)

  const photoKey = view === 'back' ? figure.photoBack : figure.photoFront
  const photoUrl = useImageUrl(figure.mode === 'foto' ? photoKey : null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const W = el.clientWidth
      const H = el.clientHeight
      const w = H > 0 ? Math.min(W, H / 2) : W
      setSize({ w, h: w * 2, x: (W - w) / 2, y: (H - w * 2) / 2 })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const layers = useMemo(() => sortedLayers(items, view), [items, view])

  // Alpha-Karten vorbereiten, damit das Antippen sofort richtig trifft.
  useEffect(() => {
    if (!editable) return
    layers.forEach((it) => {
      const key = imageKeyFor(it, view)
      if (key) void alphaMapFor(key)
    })
  }, [layers, view, editable])

  const placementOf = useCallback(
    (item: Item): Placement =>
      draft && draft.id === item.id ? draft.placement : item.placement[view],
    [draft, view],
  )

  const stagePoint = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left - size.x, y: e.clientY - rect.top - size.y }
  }

  const pick = useCallback(
    async (px: number, py: number) => {
      for (let i = layers.length - 1; i >= 0; i--) {
        const item = layers[i]
        const key = imageKeyFor(item, view)
        if (!key) continue
        const map = await alphaMapFor(key)
        if (!map) continue
        const box = layerBox(placementOf(item), size.w, size.h, map.aspect)
        if (hitsLayer(px, py, box, map)) return item.id
      }
      return null
    },
    [layers, view, size.w, size.h, placementOf],
  )

  const onPointerDown = async (e: React.PointerEvent) => {
    if (!editable) return
    const p = stagePoint(e)
    pointers.current.set(e.pointerId, p)
    try {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } catch {
      // ohne Capture funktioniert das Ziehen trotzdem, solange der Finger auf der Fläche bleibt
    }

    if (pointers.current.size === 1) {
      const id = (await pick(p.x, p.y)) ?? null
      onSelect?.(id)
      const item = id ? items.find((i) => i.id === id) : null
      gesture.current = item
        ? { id: item.id, start: { ...placementOf(item) }, px: p.x, py: p.y, dist: 0, angle: 0, moved: false }
        : null
    } else if (pointers.current.size === 2 && selectedId) {
      const [a, b] = [...pointers.current.values()]
      const item = items.find((i) => i.id === selectedId)
      if (item) {
        gesture.current = {
          id: item.id,
          start: { ...placementOf(item) },
          px: (a.x + b.x) / 2,
          py: (a.y + b.y) / 2,
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
          moved: false,
        }
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!editable || !pointers.current.has(e.pointerId)) return
    const p = stagePoint(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (!g) return

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      let rotation = g.start.rotation + (angle - g.angle)
      if (Math.abs(rotation % 360) < 4) rotation = 0
      setDraft({
        id: g.id,
        placement: {
          ...g.start,
          scale: clamp(g.start.scale * (dist / g.dist), 0.05, 2.5),
          rotation,
          x: clamp(g.start.x + (mx - g.px) / size.w, -0.3, 1.3),
          y: clamp(g.start.y + (my - g.py) / size.h, -0.3, 1.3),
        },
      })
      gesture.current = { ...g, moved: true }
      return
    }

    const dx = (p.x - g.px) / size.w
    const dy = (p.y - g.py) / size.h
    if (!g.moved && Math.hypot(p.x - g.px, p.y - g.py) < 4) return
    gesture.current = { ...g, moved: true }
    setDraft({
      id: g.id,
      placement: { ...g.start, x: clamp(g.start.x + dx, -0.3, 1.3), y: clamp(g.start.y + dy, -0.3, 1.3) },
    })
  }

  const finish = async () => {
    const g = gesture.current
    const d = draft
    gesture.current = null
    if (g && d && g.moved) {
      await onPlacementChange?.(d.id, d.placement)
    }
    setDraft(null)
  }

  const onPointerUp = async (e: React.PointerEvent) => {
    if (!editable) return
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) await finish()
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`relative mx-auto aspect-[1/2] w-full max-w-[380px] overflow-hidden rounded-3xl ${className}`}
      style={{ touchAction: editable ? 'none' : undefined }}
    >
      <div
        className="absolute"
        style={{ left: size.x, top: size.y, width: size.w, height: size.h }}
      >
        {figure.mode === 'foto' && photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            style={{ opacity: figure.photoOpacity }}
            draggable={false}
          />
        ) : (
          <Silhouette figure={figure} view={view} />
        )}
        {figure.mode === 'foto' && !photoUrl && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/45">
            Noch kein Ganzkörperfoto für diese Ansicht hinterlegt – unter „Figur“ ergänzen.
          </div>
        )}
        {size.w > 0 &&
          layers.map((item) => (
            <Layer
              key={item.id}
              item={item}
              view={view}
              selected={selectedId === item.id}
              editable={editable}
              stageW={size.w}
              stageH={size.h}
              placement={placementOf(item)}
            />
          ))}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { aiSegment, aiSupported, onAiProgress, type AiProgress } from '../lib/ai'
import { applyMask, cleanMask, fullMask, magicWand, paintMask, refineEdges } from '../lib/image'
import type { AiQuality } from '../lib/types'
import { Button, Icon, Slider } from './ui'

type Tool = 'radierer' | 'zurueck' | 'zauberstab'

interface Props {
  source: ImageData
  quality: AiQuality
  autoRun: boolean
  onDone: (result: ImageData) => void
  onBack: () => void
  label?: string
}

/**
 * Freistellen: erst die KI drüberlaufen lassen, danach von Hand nachputzen.
 * Gearbeitet wird auf einer Graustufen-Maske; das Originalbild bleibt
 * unangetastet, damit "Wiederherstellen" jederzeit funktioniert.
 */
export function CutoutEditor({ source, quality, autoRun, onDone, onBack, label }: Props) {
  const viewRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskImgRef = useRef<ImageData | null>(null)
  const maskRef = useRef<Uint8ClampedArray>(fullMask(source.width, source.height))
  const historyRef = useRef<Uint8ClampedArray[]>([])
  const drawing = useRef<{ x: number; y: number } | null>(null)

  const [tool, setTool] = useState<Tool>('radierer')
  const [brush, setBrush] = useState(Math.round(Math.max(source.width, source.height) / 16))
  const [tolerance, setTolerance] = useState(32)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<AiProgress | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [touched, setTouched] = useState(false)

  /* --- Zeichenflächen einmalig aufbauen --- */
  useEffect(() => {
    const base = document.createElement('canvas')
    base.width = source.width
    base.height = source.height
    base.getContext('2d')!.putImageData(source, 0, 0)
    baseRef.current = base

    const mc = document.createElement('canvas')
    mc.width = source.width
    mc.height = source.height
    maskCanvasRef.current = mc

    const img = new ImageData(source.width, source.height)
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 255
      img.data[i + 1] = 255
      img.data[i + 2] = 255
      img.data[i + 3] = 255
    }
    maskImgRef.current = img
    maskRef.current = fullMask(source.width, source.height)
    historyRef.current = []
    setCanUndo(false)
    setTouched(false)
  }, [source])

  const compose = useCallback(() => {
    const view = viewRef.current
    const base = baseRef.current
    const mc = maskCanvasRef.current
    if (!view || !base || !mc) return
    const ctx = view.getContext('2d')!
    ctx.clearRect(0, 0, view.width, view.height)
    ctx.drawImage(base, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(mc, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
  }, [])

  /** Maske (ganz oder nur ein Ausschnitt) auf die Zeichenfläche übertragen. */
  const syncMask = useCallback(
    (rect?: { x: number; y: number; w: number; h: number }) => {
      const mc = maskCanvasRef.current
      const img = maskImgRef.current
      if (!mc || !img) return
      const mask = maskRef.current
      const x0 = rect ? Math.max(0, rect.x) : 0
      const y0 = rect ? Math.max(0, rect.y) : 0
      const x1 = rect ? Math.min(source.width, rect.x + rect.w) : source.width
      const y1 = rect ? Math.min(source.height, rect.y + rect.h) : source.height
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * source.width + x
          img.data[i * 4 + 3] = mask[i]
        }
      }
      const ctx = mc.getContext('2d')!
      if (rect) ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0)
      else ctx.putImageData(img, 0, 0)
      compose()
    },
    [compose, source.height, source.width],
  )

  useEffect(() => {
    syncMask()
  }, [syncMask])

  useEffect(() => onAiProgress(setProgress), [])

  const pushHistory = () => {
    historyRef.current.push(new Uint8ClampedArray(maskRef.current))
    if (historyRef.current.length > 12) historyRef.current.shift()
    setCanUndo(true)
    setTouched(true)
  }

  const undo = () => {
    const prev = historyRef.current.pop()
    if (!prev) return
    maskRef.current = prev
    setCanUndo(historyRef.current.length > 0)
    syncMask()
  }

  const runAi = useCallback(async () => {
    if (!aiSupported()) {
      setAiError('Dein Browser unterstützt die lokale KI nicht. Nutze Zauberstab und Radierer.')
      return
    }
    setBusy('KI')
    setAiError(null)
    try {
      const mask = await aiSegment(source, quality)
      pushHistory()
      maskRef.current = refineEdges(
        cleanMask(mask, source.width, source.height),
        source.width,
        source.height,
        1,
      )
      syncMask()
    } catch (e) {
      setAiError(
        (e as Error).message?.includes('fetch') || !navigator.onLine
          ? 'Das Modell konnte nicht geladen werden – bist du offline? Beim ersten Mal braucht es Internet.'
          : `Automatisches Freistellen fehlgeschlagen: ${(e as Error).message}`,
      )
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }, [quality, source, syncMask])

  const ranAuto = useRef(false)
  useEffect(() => {
    if (autoRun && !ranAuto.current && aiSupported()) {
      ranAuto.current = true
      void runAi()
    }
  }, [autoRun, runAi])

  /* --- Zeigereingabe --- */
  const toImage = (e: React.PointerEvent) => {
    const c = viewRef.current!
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    }
  }

  const strokeTo = (x: number, y: number) => {
    const from = drawing.current
    const value = tool === 'radierer' ? 0 : 255
    const r = brush / 2
    if (from) {
      const dist = Math.hypot(x - from.x, y - from.y)
      const steps = Math.max(1, Math.ceil(dist / (r * 0.4)))
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        paintMask(
          maskRef.current,
          source.width,
          source.height,
          from.x + (x - from.x) * t,
          from.y + (y - from.y) * t,
          r,
          value,
        )
      }
      syncMask({
        x: Math.min(from.x, x) - r - 2,
        y: Math.min(from.y, y) - r - 2,
        w: Math.abs(x - from.x) + brush + 4,
        h: Math.abs(y - from.y) + brush + 4,
      })
    } else {
      paintMask(maskRef.current, source.width, source.height, x, y, r, value)
      syncMask({ x: x - r - 2, y: y - r - 2, w: brush + 4, h: brush + 4 })
    }
    drawing.current = { x, y }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = toImage(e)
    pushHistory()
    if (tool === 'zauberstab') {
      maskRef.current = magicWand(source, maskRef.current, x, y, tolerance, 'remove')
      syncMask()
      return
    }
    drawing.current = null
    strokeTo(x, y)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (busy || tool === 'zauberstab' || !drawing.current) return
    if (e.buttons === 0 && e.pointerType === 'mouse') return
    const { x, y } = toImage(e)
    strokeTo(x, y)
  }

  const onPointerUp = () => {
    drawing.current = null
  }

  const finish = () => {
    onDone(applyMask(source, maskRef.current))
  }

  const tools: { id: Tool; icon: string; label: string }[] = [
    { id: 'radierer', icon: 'brush', label: 'Radieren' },
    { id: 'zurueck', icon: 'undo', label: 'Zurückholen' },
    { id: 'zauberstab', icon: 'wand', label: 'Zauberstab' },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <Icon name="back" size={16} /> Zurück
        </Button>
        <span className="truncate text-[13px] text-white/45">{label ?? 'Freistellen'}</span>
        <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo}>
          <Icon name="undo" size={16} /> Undo
        </Button>
      </div>

      <div className="checker relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl">
        <canvas
          ref={viewRef}
          width={source.width}
          height={source.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="max-h-full max-w-full touch-none"
          style={{ cursor: 'crosshair' }}
        />
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-950/75 px-8 text-center backdrop-blur-sm">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-sand-300" />
            <div className="text-[13.5px] text-white/75">
              {progress?.text ?? 'Kleidungsstück wird freigestellt …'}
            </div>
            {progress && progress.ratio > 0 && progress.ratio < 1 && (
              <div className="h-1.5 w-52 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-sand-300 transition-[width]"
                  style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                />
              </div>
            )}
            <p className="max-w-xs text-[11.5px] leading-relaxed text-white/35">
              Beim ersten Mal wird das Modell einmalig heruntergeladen. Danach geht es auch
              offline und deutlich schneller.
            </p>
          </div>
        )}
      </div>

      {aiError && (
        <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200/90">
          {aiError}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11.5px] transition-colors ${
              tool === t.id
                ? 'border-sand-300 bg-sand-300/15 text-sand-100'
                : 'border-ink-700 bg-ink-850 text-white/55'
            }`}
          >
            <Icon name={t.icon} size={19} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tool === 'zauberstab' ? (
          <Slider
            label="Toleranz – wie ähnlich Farben sein müssen"
            min={8}
            max={90}
            value={tolerance}
            onChange={setTolerance}
            display={String(tolerance)}
          />
        ) : (
          <Slider
            label="Pinselgröße"
            min={6}
            max={Math.round(Math.max(source.width, source.height) / 3)}
            value={brush}
            onChange={setBrush}
            display={`${brush} px`}
          />
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="subtle" onClick={runAi} disabled={!!busy} className="flex-1">
          <Icon name="sparkles" size={17} /> {touched ? 'KI neu' : 'KI freistellen'}
        </Button>
        <Button variant="primary" onClick={finish} disabled={!!busy} className="flex-[1.4]">
          <Icon name="check" size={17} /> Übernehmen
        </Button>
      </div>
    </div>
  )
}

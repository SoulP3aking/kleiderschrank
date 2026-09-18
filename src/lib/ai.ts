/** Bequemer Zugriff auf den KI-Worker aus der Oberfläche heraus. */
import type { WorkerIn, WorkerOut } from './ai.worker'
import type { AiQuality } from './types'

export interface AiProgress {
  text: string
  ratio: number
}

type Pending = {
  resolve: (value: never) => void
  reject: (reason: Error) => void
}

let worker: Worker | null = null
const pending = new Map<string, Pending>()
const listeners = new Set<(p: AiProgress | null) => void>()

export function onAiProgress(fn: (p: AiProgress | null) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const emit = (p: AiProgress | null) => listeners.forEach((l) => l(p))

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data
    if (msg.type === 'progress') {
      emit({ text: msg.text, ratio: msg.ratio })
      return
    }
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (!pending.size) emit(null)
    if (msg.type === 'error') p.reject(new Error(msg.message))
    else p.resolve(msg as never)
  }
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Der KI-Worker konnte nicht gestartet werden.')
    pending.forEach((p) => p.reject(err))
    pending.clear()
    emit(null)
  }
  return worker
}

let counter = 0
function send<T extends WorkerOut>(msg: WorkerIn, transfer: Transferable[] = []) {
  return new Promise<T>((resolve, reject) => {
    pending.set(msg.id, { resolve: resolve as (v: never) => void, reject })
    getWorker().postMessage(msg, transfer)
  })
}

const nextId = () => `ai-${++counter}`

/** Freistellen: liefert eine Alpha-Maske in Originalgröße des übergebenen Bildes. */
export async function aiSegment(data: ImageData, quality: AiQuality) {
  const copy = new Uint8ClampedArray(data.data)
  const res = await send<Extract<WorkerOut, { type: 'mask' }>>(
    {
      type: 'segment',
      id: nextId(),
      buffer: copy.buffer as ArrayBuffer,
      width: data.width,
      height: data.height,
      quality,
    },
    [copy.buffer as ArrayBuffer],
  )
  return new Uint8ClampedArray(res.buffer)
}

/** Erkennung: Kategorie, Muster und Stil eines (am besten freigestellten) Bildes. */
export async function aiClassify(data: ImageData) {
  const copy = new Uint8ClampedArray(data.data)
  return send<Extract<WorkerOut, { type: 'labels' }>>(
    {
      type: 'classify',
      id: nextId(),
      buffer: copy.buffer as ArrayBuffer,
      width: data.width,
      height: data.height,
    },
    [copy.buffer as ArrayBuffer],
  )
}

/** Modelle im Voraus laden, z. B. über WLAN, damit es unterwegs schnell geht. */
export async function aiPreload(what: 'segment' | 'classify', quality: AiQuality) {
  return send<Extract<WorkerOut, { type: 'ready' }>>({
    type: 'preload',
    id: nextId(),
    what,
    quality,
  })
}

export function aiSupported() {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
}

/** Sind die Modelle schon im Browser-Cache, also offline verfügbar? */
export async function aiCached() {
  if (!('caches' in self)) return false
  try {
    const cache = await caches.open('transformers-cache')
    const keys = await cache.keys()
    return keys.length > 0
  } catch {
    return false
  }
}

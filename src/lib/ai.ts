/** Bequemer Zugriff auf den KI-Worker aus der Oberfläche heraus. */
import {
  blockClassify,
  classifyBlocked,
  clearRunning,
  currentPlan,
  isMemoryError,
  markRunning,
  stepDown,
  type SegPlan,
} from './aiPlan'
import type { WorkerIn, WorkerOut } from './ai.worker'
import { resizeImageData } from './image'
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

/** Die KI ist nach wiederholten Abstürzen auf diesem Gerät abgeschaltet. */
export class AiDisabledError extends Error {
  constructor() {
    super('Die automatische Freistellung ist auf diesem Gerät nach Abstürzen abgeschaltet.')
    this.name = 'AiDisabledError'
  }
}

function crash(message: string) {
  const err = new Error(message)
  err.name = 'WorkerCrash'
  return err
}

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
  // Stirbt der Worker (z. B. Speicher voll), kommt kein normales Ergebnis mehr.
  worker.onerror = (e) => {
    e.preventDefault?.()
    const err = crash(e.message || 'Der KI-Worker ist abgestürzt.')
    pending.forEach((p) => p.reject(err))
    pending.clear()
    emit(null)
    resetWorker()
  }
  return worker
}

/** Worker beenden – gibt seinen kompletten Speicher (inkl. Modelle) sofort frei. */
export function resetWorker() {
  worker?.terminate()
  worker = null
}

let counter = 0
const nextId = () => `ai-${++counter}`

function send<T extends WorkerOut>(msg: WorkerIn, transfer: Transferable[] = []) {
  return new Promise<T>((resolve, reject) => {
    pending.set(msg.id, { resolve: resolve as (v: never) => void, reject })
    getWorker().postMessage(msg, transfer)
  })
}

/**
 * Freistellen: liefert eine Alpha-Maske in Originalgröße des Bildes und den
 * verwendeten Plan. Scheitert es am Speicher, geht es automatisch eine Stufe
 * sparsamer weiter.
 */
export async function aiSegment(data: ImageData, quality: AiQuality) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const plan = await currentPlan(quality)
    if (!plan) throw new AiDisabledError()
    const copy = new Uint8ClampedArray(data.data)
    const mark = markRunning('segment', plan.label)
    try {
      const res = await send<Extract<WorkerOut, { type: 'mask' }>>(
        {
          type: 'segment',
          id: nextId(),
          buffer: copy.buffer as ArrayBuffer,
          width: data.width,
          height: data.height,
          plan,
        },
        [copy.buffer as ArrayBuffer],
      )
      clearRunning(mark)
      return { mask: new Uint8ClampedArray(res.buffer), plan }
    } catch (e) {
      clearRunning(mark)
      if (!isMemoryError(e)) throw e
      stepDown()
      resetWorker()
    }
  }
  throw new AiDisabledError()
}

/** Erkennung: Kategorie, Muster und Stil eines (am besten freigestellten) Bildes. */
export async function aiClassify(data: ImageData) {
  if (classifyBlocked()) throw new AiDisabledError()
  // MobileCLIP rechnet ohnehin mit 256 px – kleiner schicken spart Speicher.
  const small = resizeImageData(data, 384)
  const copy = new Uint8ClampedArray(small.data)
  const mark = markRunning('classify', 'Erkennung')
  try {
    return await send<Extract<WorkerOut, { type: 'labels' }>>(
      {
        type: 'classify',
        id: nextId(),
        buffer: copy.buffer as ArrayBuffer,
        width: small.width,
        height: small.height,
      },
      [copy.buffer as ArrayBuffer],
    )
  } catch (e) {
    // Speicherprobleme bei der Erkennung: lieber ohne Erkennung weiter als Abstürze.
    if (isMemoryError(e)) {
      blockClassify()
      resetWorker()
    }
    throw e
  } finally {
    clearRunning(mark)
  }
}

/** Modelle im Voraus laden, z. B. über WLAN, damit es unterwegs schnell geht. */
export async function aiPreload(what: 'segment' | 'classify', quality: AiQuality) {
  let plan: SegPlan | undefined
  if (what === 'segment') {
    plan = (await currentPlan(quality)) ?? undefined
    if (!plan) throw new AiDisabledError()
  }
  const mark = markRunning(what, plan?.label ?? 'Erkennung')
  try {
    return await send<Extract<WorkerOut, { type: 'ready' }>>({ type: 'preload', id: nextId(), what, plan })
  } finally {
    clearRunning(mark)
  }
}

export function aiSupported() {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
}

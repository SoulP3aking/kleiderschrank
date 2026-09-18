/// <reference lib="webworker" />
/**
 * Läuft in einem eigenen Thread, damit die Oberfläche nicht einfriert.
 * Die Modelle kommen vom Hugging-Face-CDN (kostenlos, ohne Account) und werden
 * danach vom Browser gecacht. Die Fotos selbst verlassen das Gerät nie.
 *
 *  - Freistellen:  briaai/RMBG-1.4        (q8: 42 MB · fp16: 84 MB · fp32: 168 MB)
 *    q8 hinterlässt auf hellem Grund Flecken – die räumt cleanMask() im Editor weg.
 *  - Erkennen:     Xenova/mobileclip_s0   (nur Bild-Teil, fp16: 22 MB)
 *    Die q8-Variante dieses Modells liefert nur Zufallstreffer – fp16 ist so genau wie fp32.
 *    Die Text-Seite ist in clipLabels.json vorberechnet (scripts/build-clip-labels.mjs).
 */
import {
  AutoModel,
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
  type PreTrainedModel,
  type Processor,
} from '@huggingface/transformers'
import labels from './clipLabels.json'
import type { AiQuality } from './types'

env.allowLocalModels = false

const SEG_MODEL = 'briaai/RMBG-1.4'
const CLIP_MODEL = labels.model

type Quality = AiQuality
type Dtype = 'fp32' | 'fp16' | 'q8'
type Device = 'webgpu' | 'wasm'

export type WorkerIn =
  | { type: 'segment'; id: string; buffer: ArrayBuffer; width: number; height: number; quality: Quality }
  | { type: 'classify'; id: string; buffer: ArrayBuffer; width: number; height: number }
  | { type: 'preload'; id: string; what: 'segment' | 'classify'; quality: Quality }

export type WorkerOut =
  | { type: 'progress'; task: string; text: string; ratio: number }
  | { type: 'mask'; id: string; buffer: ArrayBuffer; width: number; height: number }
  | { type: 'labels'; id: string; category: string; pattern: string; style: string; confidence: number }
  | { type: 'ready'; id: string }
  | { type: 'error'; id: string; message: string }

const post = (msg: WorkerOut, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)

let hasGpu: boolean | null = null
async function gpuAvailable() {
  if (hasGpu !== null) return hasGpu
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    hasGpu = !!(gpu && (await gpu.requestAdapter()))
  } catch {
    hasGpu = false
  }
  return hasGpu
}

/** Baut aus den Fortschrittsdaten von transformers.js eine Zeile für die Anzeige. */
function progressReporter(task: string) {
  const files = new Map<string, { loaded: number; total: number }>()
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file) {
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      const mb = (n: number) => (n / 1048576).toFixed(0)
      // Erst die großen Gewichte sind eine Angabe wert, die Konfig-Dateien haben nur ein paar KB.
      const big = total > 2 * 1048576
      post({
        type: 'progress',
        task,
        text: big ? `KI-Modell wird geladen … ${mb(loaded)} / ${mb(total)} MB` : 'KI-Modell wird geladen …',
        ratio: big ? loaded / total : 0,
      })
    }
  }
}

/** RGBA-Puffer -> RGB-Bild. Transparente Stellen werden weiß statt "alter Hintergrund". */
function toRgb(buffer: ArrayBuffer, width: number, height: number, flatten: boolean) {
  const src = new Uint8ClampedArray(buffer)
  const out = new Uint8ClampedArray(width * height * 3)
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
    const a = flatten ? src[i + 3] / 255 : 1
    out[j] = src[i] * a + 255 * (1 - a)
    out[j + 1] = src[i + 1] * a + 255 * (1 - a)
    out[j + 2] = src[i + 2] * a + 255 * (1 - a)
  }
  return new RawImage(out, width, height, 3)
}

/* ---------------- Freisteller (RMBG-1.4) ---------------- */

let segModel: PreTrainedModel | null = null
let segProcessor: Processor | null = null
let segQuality: Quality | null = null

async function loadSegmenter(quality: Quality) {
  if (segModel && segProcessor && segQuality === quality) return
  const gpu = await gpuAvailable()
  // q8 ist auf der CPU (wasm) am schnellsten, fp16/fp32 spielen ihre Stärke auf der GPU aus.
  // Gemessen: fp16 auf der GPU ~1 s pro Bild und sauberer als q8; q8 auf der CPU ~5 s.
  const attempts: [Dtype, Device][] =
    quality === 'schnell'
      ? [['q8', 'wasm']]
      : quality === 'auto'
        ? gpu
          ? [['fp16', 'webgpu'], ['q8', 'wasm']]
          : [['q8', 'wasm']]
        : gpu
          ? [['fp16', 'webgpu'], ['fp32', 'webgpu'], ['fp32', 'wasm'], ['q8', 'wasm']]
          : [['fp32', 'wasm'], ['q8', 'wasm']]

  const progress_callback = progressReporter('segment')
  let lastError: unknown
  for (const [dtype, device] of attempts) {
    try {
      segModel = await AutoModel.from_pretrained(SEG_MODEL, { device, dtype, progress_callback })
      segProcessor = await AutoProcessor.from_pretrained(SEG_MODEL, { progress_callback })
      segQuality = quality
      return
    } catch (e) {
      lastError = e
      segModel = null
      segProcessor = null
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Freisteller-Modell nicht ladbar')
}

async function segment(msg: Extract<WorkerIn, { type: 'segment' }>) {
  await loadSegmenter(msg.quality)
  post({ type: 'progress', task: 'segment', text: 'Kleidungsstück wird freigestellt …', ratio: 1 })

  const image = toRgb(msg.buffer, msg.width, msg.height, false)
  const { pixel_values } = await segProcessor!(image)
  const result = await segModel!({ input: pixel_values })
  // Je nach Modellrevision heißt der Ausgang "output" oder ist einfach der erste Tensor.
  const tensor = result.output ?? Object.values(result)[0]
  const mask = await RawImage.fromTensor(tensor[0].mul(255).to('uint8')).resize(msg.width, msg.height)
  const bytes = new Uint8ClampedArray(mask.data)
  post(
    { type: 'mask', id: msg.id, buffer: bytes.buffer as ArrayBuffer, width: mask.width, height: mask.height },
    [bytes.buffer as ArrayBuffer],
  )
}

/* ---------------- Erkennung (MobileCLIP, zero-shot) ---------------- */

let clipModel: PreTrainedModel | null = null
let clipProcessor: Processor | null = null

async function loadClip() {
  if (clipModel && clipProcessor) return
  const progress_callback = progressReporter('classify')
  clipModel = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, {
    device: 'wasm',
    dtype: 'fp16',
    progress_callback,
  })
  clipProcessor = await AutoProcessor.from_pretrained(CLIP_MODEL, { progress_callback })
}

interface LabelVec {
  value: string
  vec: Float32Array
}

/** Int8-gepackte Label-Vektoren einmalig entpacken. */
const decoded: Record<string, LabelVec[]> = {}
function labelGroup(name: keyof typeof labels.groups): LabelVec[] {
  if (decoded[name]) return decoded[name]
  decoded[name] = labels.groups[name].map((l) => {
    const bin = atob(l.v)
    const vec = new Float32Array(bin.length)
    for (let i = 0; i < bin.length; i++) {
      const b = bin.charCodeAt(i)
      vec[i] = (b > 127 ? b - 256 : b) * l.scale
    }
    return { value: l.value, vec }
  })
  return decoded[name]
}

function best(embedding: Float32Array, group: LabelVec[]) {
  // Wie bei CLIP üblich: Kosinus-Ähnlichkeit * 100, dann Softmax.
  const logits = group.map((l) => {
    let dot = 0
    for (let i = 0; i < embedding.length; i++) dot += embedding[i] * l.vec[i]
    return dot * 100
  })
  const max = Math.max(...logits)
  const exps = logits.map((x) => Math.exp(x - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  let bestIdx = 0
  logits.forEach((_, i) => {
    if (exps[i] > exps[bestIdx]) bestIdx = i
  })
  return { value: group[bestIdx].value, score: exps[bestIdx] / sum }
}

async function classify(msg: Extract<WorkerIn, { type: 'classify' }>) {
  await loadClip()
  post({ type: 'progress', task: 'classify', text: 'Kleidungsstück wird erkannt …', ratio: 1 })
  const image = toRgb(msg.buffer, msg.width, msg.height, true)
  const inputs = await clipProcessor!(image)
  const { image_embeds } = await clipModel!(inputs)
  const raw = image_embeds.data as Float32Array
  const norm = Math.hypot(...raw) || 1
  const emb = raw.map((x) => x / norm)

  const category = best(emb, labelGroup('category'))
  const pattern = best(emb, labelGroup('pattern'))
  const style = best(emb, labelGroup('style'))
  post({
    type: 'labels',
    id: msg.id,
    category: category.value,
    pattern: pattern.value,
    style: style.value,
    confidence: category.score,
  })
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data
  try {
    if (msg.type === 'segment') await segment(msg)
    else if (msg.type === 'classify') await classify(msg)
    else if (msg.type === 'preload') {
      if (msg.what === 'segment') await loadSegmenter(msg.quality)
      else await loadClip()
      post({ type: 'ready', id: msg.id })
    }
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}

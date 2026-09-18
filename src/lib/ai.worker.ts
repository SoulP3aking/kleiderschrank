/// <reference lib="webworker" />
/**
 * Läuft in einem eigenen Thread, damit die Oberfläche nicht einfriert.
 * Die Modelle kommen von den CDNs von Hugging Face/jsDelivr (kostenlos, ohne
 * Account) und werden danach vom Browser gecacht. Die Fotos verlassen das Gerät nie.
 *
 * Freistellen – welches Modell, entscheidet aiPlan.ts (je nach Gerät und Abstürzen):
 *  - briaai/RMBG-1.4           fest 1024x1024, ~550 MB Arbeitsspeicher beim Rechnen
 *                              (q8: 42 MB · fp16: 84 MB · fp32: 168 MB Download)
 *  - BritishWerewolf/U-2-Netp  320x320, ~220 MB, 4,4 MB Download – Notfall-Stufe,
 *                              schwach bei hellen Teilen auf hellem Grund
 * Erkennen: Xenova/mobileclip_s0 (nur Bild-Teil, fp16: 22 MB). Die q8-Variante
 * liefert nur Zufallstreffer. Die Text-Seite ist in clipLabels.json vorberechnet.
 */
import {
  AutoModel,
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  Tensor,
  env,
  type PreTrainedModel,
  type Processor,
} from '@huggingface/transformers'
import type { SegPlan } from './aiPlan'
import labels from './clipLabels.json'

env.allowLocalModels = false

const CLIP_MODEL = labels.model
const SEG_REPO: Record<SegPlan['model'], string> = {
  rmbg: 'briaai/RMBG-1.4',
  u2netp: 'BritishWerewolf/U-2-Netp',
}

export type WorkerIn =
  | { type: 'segment'; id: string; buffer: ArrayBuffer; width: number; height: number; plan: SegPlan }
  | { type: 'classify'; id: string; buffer: ArrayBuffer; width: number; height: number }
  | { type: 'preload'; id: string; what: 'segment' | 'classify'; plan?: SegPlan }

export type WorkerOut =
  | { type: 'progress'; task: string; text: string; ratio: number }
  | { type: 'mask'; id: string; buffer: ArrayBuffer; width: number; height: number }
  | { type: 'labels'; id: string; category: string; pattern: string; style: string; confidence: number }
  | { type: 'ready'; id: string }
  | { type: 'error'; id: string; message: string }

const post = (msg: WorkerOut, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)

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
    } else if (p.status === 'done' && p.file?.endsWith('.onnx')) {
      post({ type: 'progress', task, text: 'KI-Modell wird gestartet …', ratio: 0 })
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

/** Bild (w x h) in einen normierten CHW-Tensor size x size, Rest mit 0 aufgefüllt. */
function toTensor(img: RawImage, size: number, mean: number[], std: number[]) {
  const plane = size * size
  const f = new Float32Array(3 * plane)
  const ch = img.channels
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const s = (y * img.width + x) * ch
      const d = y * size + x
      for (let c = 0; c < 3; c++) f[c * plane + d] = (img.data[s + c] / 255 - mean[c]) / std[c]
    }
  }
  return new Tensor('float32', f, [1, 3, size, size])
}

/* ---------------- Freisteller ---------------- */

let segModel: PreTrainedModel | null = null
let segKey: string | null = null

async function loadSegmenter(plan: SegPlan) {
  const key = `${plan.model}-${plan.dtype}-${plan.device}`
  if (segModel && segKey === key) return segModel
  // Altes Modell erst freigeben – zwei gleichzeitig wären auf dem Handy zu viel.
  if (segModel) {
    await segModel.dispose().catch(() => {})
    segModel = null
    segKey = null
  }
  segModel = await AutoModel.from_pretrained(SEG_REPO[plan.model], {
    device: plan.device,
    dtype: plan.dtype,
    progress_callback: progressReporter('segment'),
  })
  segKey = key
  return segModel
}

async function segmentRmbg(model: PreTrainedModel, image: RawImage) {
  // RMBG-1.4 akzeptiert nur exakt 1024x1024 (gemessen – andere Größen lehnt ONNX ab).
  const resized = await image.resize(1024, 1024)
  const out = await model({ input: toTensor(resized, 1024, [0.5, 0.5, 0.5], [1, 1, 1]) })
  const tensor = out.output ?? Object.values(out)[0]
  return RawImage.fromTensor(tensor[0].mul(255).to('uint8'))
}

async function segmentU2netp(model: PreTrainedModel, image: RawImage) {
  // Seitenverhältnis behalten, längste Kante 320, oben links in 320x320 einsetzen.
  const S = 320
  const f = S / Math.max(image.width, image.height)
  const w = Math.max(1, Math.round(image.width * f))
  const h = Math.max(1, Math.round(image.height * f))
  const resized = await image.resize(w, h)
  const out = await model({
    'input.1': toTensor(resized, S, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
  })
  const t = (out['1959'] ?? Object.values(out)[0]) as Tensor
  const d = t.data as Float32Array
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < d.length; i++) {
    if (d[i] < min) min = d[i]
    if (d[i] > max) max = d[i]
  }
  const range = max - min || 1
  const crop = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) crop[y * w + x] = ((d[y * S + x] - min) / range) * 255
  return new RawImage(crop, w, h, 1)
}

async function segment(msg: Extract<WorkerIn, { type: 'segment' }>) {
  const model = await loadSegmenter(msg.plan)
  post({ type: 'progress', task: 'segment', text: 'Kleidungsstück wird freigestellt …', ratio: 1 })
  const image = toRgb(msg.buffer, msg.width, msg.height, false)
  const small =
    msg.plan.model === 'rmbg' ? await segmentRmbg(model, image) : await segmentU2netp(model, image)
  const mask = await small.resize(msg.width, msg.height)
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
      if (msg.what === 'segment' && msg.plan) await loadSegmenter(msg.plan)
      else if (msg.what === 'classify') await loadClip()
      post({ type: 'ready', id: msg.id })
    }
  } catch (err) {
    post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}

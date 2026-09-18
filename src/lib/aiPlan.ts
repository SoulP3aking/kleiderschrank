/**
 * Welches KI-Modell läuft auf diesem Gerät – und was passiert, wenn es abstürzt?
 *
 * Gemessen (Chrome, WASM): RMBG-1.4 belegt beim Rechnen ~550 MB Arbeitsspeicher,
 * U²-Net-p ~220 MB. Auf Handys (v. a. Safari) kann das große Modell den Tab
 * sprengen; der Browser lädt die Seite dann einfach neu. Darum:
 *  - vor jedem KI-Schritt eine Markierung in localStorage setzen,
 *  - findet der nächste Seitenstart sie noch vor, war es ein Absturz,
 *  - dann eine Stufe sparsamer weitermachen (bis hin zu "KI aus").
 * Die Stufe hängt am Gerät, nicht am Schrank – darum localStorage statt IndexedDB.
 */
import type { AiQuality } from './types'

export type SegModel = 'rmbg' | 'u2netp'

export interface SegPlan {
  model: SegModel
  dtype: 'fp32' | 'fp16' | 'q8'
  device: 'webgpu' | 'wasm'
  /** Für Anzeige und Diagnose. */
  label: string
  /** Ungefährer Download beim ersten Mal (MB). */
  mb: number
}

const RMBG_GPU: SegPlan = { model: 'rmbg', dtype: 'fp16', device: 'webgpu', label: 'Großes Modell (Grafikeinheit)', mb: 84 }
const RMBG_FP32: SegPlan = { model: 'rmbg', dtype: 'fp32', device: 'wasm', label: 'Großes Modell (volle Genauigkeit)', mb: 168 }
const RMBG_CPU: SegPlan = { model: 'rmbg', dtype: 'q8', device: 'wasm', label: 'Großes Modell (Prozessor)', mb: 42 }
const U2NETP: SegPlan = { model: 'u2netp', dtype: 'fp32', device: 'wasm', label: 'Leichtes Modell', mb: 5 }

export const planKey = (p: SegPlan) => `${p.model}-${p.dtype}-${p.device}`

/* ---------------- Gerät ---------------- */

export function isMobileDevice() {
  const ua = navigator.userAgent
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true
  // iPadOS meldet sich als Mac – verrät sich aber über den Touchscreen.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/** Arbeitsspeicher in GB, soweit der Browser es verrät (Safari tut es nicht). */
export const deviceMemory = () =>
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null

let gpuCache: boolean | null = null
export async function hasWebGpu() {
  if (gpuCache !== null) return gpuCache
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    gpuCache = !!(gpu && (await gpu.requestAdapter()))
  } catch {
    gpuCache = false
  }
  return gpuCache
}

/** Wenig Speicher = Handy oder ein Rechner mit höchstens 4 GB. */
export function isLowMemory() {
  const mem = deviceMemory()
  return isMobileDevice() || (mem !== null && mem <= 4)
}

/** Von bevorzugt nach sparsam – jede erkannte Absturz-Stufe rückt eins weiter. */
export function ladder(quality: AiQuality, gpu: boolean, low: boolean): SegPlan[] {
  if (quality === 'schnell') return [U2NETP]
  if (quality === 'gut') {
    if (gpu) return low ? [RMBG_GPU, RMBG_CPU, U2NETP] : [RMBG_GPU, RMBG_FP32, RMBG_CPU, U2NETP]
    return low ? [RMBG_CPU, U2NETP] : [RMBG_FP32, RMBG_CPU, U2NETP]
  }
  // auto: auf dem Handy nie die Grafikeinheit – dort ist sie das größere Absturzrisiko.
  if (gpu && !low) return [RMBG_GPU, RMBG_CPU, U2NETP]
  return [RMBG_CPU, U2NETP]
}

/* ---------------- Absturz-Stufe ---------------- */

const KEY_LEVEL = 'kleiderschrank.kiStufe'
const KEY_NO_CLASSIFY = 'kleiderschrank.erkennungAus'
const KEY_RUNNING = 'kleiderschrank.kiLaeuft'
const KEY_CRASHES = 'kleiderschrank.kiAbstuerze'

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* privater Modus o. Ä. – dann eben ohne Gedächtnis */
  }
}

export const crashLevel = () => Number(read(KEY_LEVEL) ?? 0) || 0
export const crashCount = () => Number(read(KEY_CRASHES) ?? 0) || 0
export const classifyBlocked = () => read(KEY_NO_CLASSIFY) === '1'

export function stepDown() {
  write(KEY_LEVEL, String(crashLevel() + 1))
  write(KEY_CRASHES, String(crashCount() + 1))
}

/** Erkennung auf diesem Gerät abschalten (nach Absturz). */
export function blockClassify() {
  write(KEY_NO_CLASSIFY, '1')
  write(KEY_CRASHES, String(crashCount() + 1))
}

export function resetSafety() {
  write(KEY_LEVEL, null)
  write(KEY_NO_CLASSIFY, null)
  write(KEY_CRASHES, null)
}

/** Aktueller Plan – oder null, wenn die KI nach Abstürzen ganz aus ist. */
export async function currentPlan(quality: AiQuality): Promise<SegPlan | null> {
  const steps = ladder(quality, await hasWebGpu(), isLowMemory())
  const level = crashLevel()
  return level < steps.length ? steps[level] : null
}

/* ---------------- Markierung "KI läuft gerade" ---------------- */

interface RunningMark {
  task: 'segment' | 'classify'
  label: string
  t: number
}

// Freistellen und Erkennen können gleichzeitig laufen – darum eine Liste mit
// eigener Kennung pro Schritt. Sonst löscht der eine die Markierung des anderen.
let markCounter = 0

function readMarks(): Record<string, RunningMark> {
  try {
    const raw = read(KEY_RUNNING)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !('task' in parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Markierung setzen; die zurückgegebene Kennung an clearRunning geben. */
export function markRunning(task: RunningMark['task'], label: string) {
  const id = `${Date.now()}-${++markCounter}`
  write(KEY_RUNNING, JSON.stringify({ ...readMarks(), [id]: { task, label, t: Date.now() } }))
  return id
}

/** Ohne Kennung: alle Markierungen löschen (Seite wird bewusst verlassen). */
export function clearRunning(id?: string) {
  if (typeof id !== 'string') {
    write(KEY_RUNNING, null)
    return
  }
  const marks = readMarks()
  delete marks[id]
  write(KEY_RUNNING, Object.keys(marks).length ? JSON.stringify(marks) : null)
}

export interface CrashNotice {
  task: RunningMark['task']
  label: string
}

let notice: CrashNotice | null = null

/**
 * Beim Seitenstart aufrufen. Liegt noch eine Markierung, ist der Tab mitten
 * in einem KI-Schritt gestorben (sonst wäre sie gelöscht worden).
 */
export function detectCrash() {
  const marks = Object.values(readMarks()).filter((m) => Date.now() - m.t < 30 * 60 * 1000)
  clearRunning()
  // Schließt man die Seite selbst, ist das kein Absturz.
  window.addEventListener('pagehide', () => clearRunning())
  if (!marks.length) return
  // Liefen beide, war es mit großer Wahrscheinlichkeit das (viel größere) Freistellen.
  const mark = marks.find((m) => m.task === 'segment') ?? marks[0]
  if (mark.task === 'segment') stepDown()
  else blockClassify()
  notice = { task: mark.task, label: mark.label }
}

/** Hinweis für die Oberfläche. Bleibt bis zum nächsten Neuladen gleich (StrictMode-sicher). */
export const takeCrashNotice = () => notice

/** Klingt der Fehler nach "Speicher voll" bzw. einem gestorbenen Worker? */
export function isMemoryError(e: unknown) {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /memory|alloc|OOM|RangeError|out of bounds|abort|device.{0,12}lost|WorkerCrash/i.test(msg)
}

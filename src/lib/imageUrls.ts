/**
 * Bilder liegen als Blob in IndexedDB. Für <img src> braucht es eine URL –
 * die wird hier einmal pro Bild erzeugt und behalten, statt bei jedem Rendern
 * neu (das wäre sonst ein Speicherleck).
 */
import { useEffect, useState } from 'react'
import { getImage } from './db'

const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

export async function imageUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null
  const hit = cache.get(key)
  if (hit) return hit
  const running = inflight.get(key)
  if (running) return running
  const p = (async () => {
    const blob = await getImage(key)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    cache.set(key, url)
    return url
  })()
  inflight.set(key, p)
  const url = await p
  inflight.delete(key)
  return url
}

export function forgetImage(key: string | null | undefined) {
  if (!key) return
  const url = cache.get(key)
  if (url) {
    URL.revokeObjectURL(url)
    cache.delete(key)
  }
}

export function forgetAllImages() {
  cache.forEach((url) => URL.revokeObjectURL(url))
  cache.clear()
}

/** React-Hook: liefert die URL zu einem Bildschlüssel (erst null, dann die URL). */
export function useImageUrl(key: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => (key ? cache.get(key) ?? null : null))
  useEffect(() => {
    let alive = true
    if (!key) {
      setUrl(null)
      return
    }
    const hit = cache.get(key)
    if (hit) {
      setUrl(hit)
      return
    }
    imageUrl(key).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [key])
  return url
}

/** Bild als HTMLImageElement, z. B. zum Zeichnen auf ein Canvas. */
export async function loadImageElement(key: string | null | undefined) {
  const url = await imageUrl(key)
  if (!url) return null
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

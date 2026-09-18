import { useEffect, useRef, useState } from 'react'
import { aiClassify } from '../lib/ai'
import { colorName, textOn } from '../lib/color'
import { dominantColors } from '../lib/color'
import { addPending, deletePending, getPending, pendingIds, putImage, uid } from '../lib/db'
import { loadScaled, makeThumb, toStoredPng } from '../lib/image'
import { forgetImage, imageUrl } from '../lib/imageUrls'
import { useStore } from '../lib/store'
import {
  CATEGORIES,
  PATTERNS,
  SEASONS,
  STYLES,
  fitPlacement,
  newPlacement,
  slotOf,
  type Item,
  type Pattern,
  type Season,
  type Style,
  type View,
} from '../lib/types'
import { CutoutEditor } from './CutoutEditor'
import { Button, Chip, Field, Icon, Sheet, inputClass } from './ui'

type Step = 'quelle' | 'freistellen' | 'details'

interface Props {
  open: boolean
  onClose: () => void
  /** Vorhandenes Teil bearbeiten statt neu anlegen. */
  edit?: Item | null
  /** Mit den Fotos aus der Warteschlange weitermachen (z. B. nach einem Absturz). */
  resume?: boolean
  onSaved?: (item: Item) => void
}

interface Draft {
  id: string
  name: string
  category: string
  colors: { hex: string; ratio: number }[]
  seasons: Season[]
  styles: Style[]
  pattern: Pattern
  brand: string
  notes: string
  favorite: boolean
  imageFront: string | null
  imageBack: string | null
  thumb: string | null
  aspect: number
  aspectBack: number | null
}

const emptyDraft = (): Draft => ({
  id: uid(),
  name: '',
  category: 'T-Shirt',
  colors: [],
  seasons: [],
  styles: [],
  pattern: 'Uni',
  brand: '',
  notes: '',
  favorite: false,
  imageFront: null,
  imageBack: null,
  thumb: null,
  aspect: 1,
  aspectBack: null,
})

export function ItemEditor({ open, onClose, edit, resume, onSaved }: Props) {
  const settings = useStore((s) => s.settings)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const pendingCount = useStore((s) => s.pendingCount)
  const refreshPending = useStore((s) => s.refreshPending)
  const discardPending = useStore((s) => s.discardPending)

  const [step, setStep] = useState<Step>('quelle')
  const [source, setSource] = useState<ImageData | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  /** Ids der noch wartenden Fotos (Warteschlange in der Datenbank). */
  const [queue, setQueue] = useState<string[]>([])
  const [working, setWorking] = useState<string | null>(null)
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const pendingView = useRef<View>('front')
  /** Warteschlangen-Eintrag des Fotos, das gerade bearbeitet wird. */
  const currentPending = useRef<string | null>(null)
  /** Id des gerade offenen Entwurfs – für späte Ergebnisse der Erkennung. */
  const draftIdRef = useRef<string>('')
  useEffect(() => {
    draftIdRef.current = draft.id
  }, [draft.id])

  /** Nächstes lesbares Foto aus der Warteschlange öffnen. */
  const startPending = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      const photo = await getPending(ids[i])
      if (!photo) continue
      try {
        const data = await loadScaled(photo.blob)
        currentPending.current = ids[i]
        pendingView.current = 'front'
        setDraft(emptyDraft())
        setSource(data)
        setQueue(ids.slice(i + 1))
        setAiNote(null)
        setStep('freistellen')
        return true
      } catch {
        // Unlesbares Bild würde sonst jedes Mal wieder auftauchen.
        await deletePending(ids[i])
      }
    }
    setQueue([])
    await refreshPending()
    return false
  }

  useEffect(() => {
    if (!open) return
    if (edit) {
      setDraft({
        id: edit.id,
        name: edit.name,
        category: edit.category,
        colors: edit.colors,
        seasons: edit.seasons,
        styles: edit.styles,
        pattern: edit.pattern,
        brand: edit.brand,
        notes: edit.notes,
        favorite: edit.favorite,
        imageFront: edit.imageFront,
        imageBack: edit.imageBack,
        thumb: edit.thumb,
        aspect: edit.aspect ?? 1,
        aspectBack: edit.aspectBack ?? null,
      })
      setStep('details')
    } else {
      setDraft(emptyDraft())
      setStep('quelle')
    }
    setSource(null)
    setAiNote(null)
    setQueue([])
    currentPending.current = null
    if (!edit && resume) {
      setWorking('Fotos werden geladen …')
      void pendingIds()
        .then(startPending)
        .finally(() => setWorking(null))
    }
    // startPending bewusst nicht als Abhängigkeit: nur beim Öffnen starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit, resume])

  // Vorschaubilder für die Details-Ansicht
  useEffect(() => {
    let alive = true
    const load = async () => {
      const [front, back] = await Promise.all([
        imageUrl(draft.imageFront),
        imageUrl(draft.imageBack),
      ])
      if (alive) setPreview({ front, back })
    }
    void load()
    return () => {
      alive = false
    }
  }, [draft.imageFront, draft.imageBack])

  const pickFiles = async (files: FileList | null, forView: View) => {
    if (!files?.length) return
    pendingView.current = forView
    const list = [...files]
    // Neue Fotos zuerst sicher ablegen – stürzt danach etwas ab, sind sie nicht weg.
    if (forView === 'front' && step === 'quelle' && !edit) {
      setWorking('Fotos werden gesichert …')
      try {
        const ids = await addPending(list)
        await refreshPending()
        await startPending(ids)
      } catch {
        setAiNote('Die Fotos konnten nicht gelesen werden.')
      } finally {
        setWorking(null)
      }
      return
    }
    setWorking('Foto wird geladen …')
    try {
      // Ersetzen bzw. Rückseite: immer nur ein Foto, die Warteschlange bleibt, wie sie ist.
      const data = await loadScaled(list[0])
      setSource(data)
      setStep('freistellen')
    } catch {
      setAiNote('Dieses Bild konnte nicht gelesen werden.')
    } finally {
      setWorking(null)
    }
  }

  const handleCutoutDone = async (result: ImageData) => {
    setWorking('Wird gespeichert …')
    try {
      const { blob, data } = await toStoredPng(result)
      const key = await putImage(blob)
      const forView = pendingView.current

      if (forView === 'back') {
        if (draft.imageBack) forgetImage(draft.imageBack)
        setDraft((d) => ({ ...d, imageBack: key, aspectBack: data.width / data.height }))
        setStep('details')
        setSource(null)
        return
      }

      const thumbBlob = await makeThumb(data)
      const thumbKey = await putImage(thumbBlob)
      const colors = dominantColors(data, 4)
      if (draft.imageFront) forgetImage(draft.imageFront)
      if (draft.thumb) forgetImage(draft.thumb)

      setDraft((d) => ({
        ...d,
        imageFront: key,
        thumb: thumbKey,
        colors,
        aspect: data.width / data.height,
      }))
      setStep('details')
      setSource(null)

      if (settings.aiClassify && !edit) {
        setAiNote('Kategorie wird erkannt …')
        // Kommt das Ergebnis erst, wenn schon das nächste Foto dran ist, gehört
        // es nicht mehr zu diesem Entwurf – dann verwerfen.
        const forDraft = draft.id
        aiClassify(data)
          .then((res) => {
            setDraft((d) => (d.id !== forDraft ? d : {
              ...d,
              category: res.category,
              pattern: (PATTERNS as string[]).includes(res.pattern)
                ? (res.pattern as Pattern)
                : d.pattern,
              styles: d.styles.length
                ? d.styles
                : (STYLES as string[]).includes(res.style)
                  ? [res.style as Style]
                  : [],
            }))
            if (draftIdRef.current !== forDraft) return
            setAiNote(
              `Erkannt: ${res.category} (${Math.round(res.confidence * 100)} % sicher) – bei Bedarf einfach ändern.`,
            )
          })
          .catch(() => {
            if (draftIdRef.current === forDraft)
              setAiNote('Automatische Erkennung nicht möglich – bitte selbst auswählen.')
          })
      }
    } finally {
      setWorking(null)
    }
  }

  const save = async () => {
    if (!draft.imageFront) return
    setWorking('Wird gespeichert …')
    const slot = slotOf(draft.category)
    try {
      if (edit) {
        // Neues Foto = anderes Format: die betroffene Ansicht neu einpassen.
        const placement = { ...edit.placement }
        if (draft.imageFront !== edit.imageFront) placement.front = fitPlacement(slot, draft.aspect)
        if (draft.imageBack !== edit.imageBack)
          placement.back = fitPlacement(slot, draft.aspectBack ?? draft.aspect)
        await updateItem(edit.id, {
          aspect: draft.aspect,
          aspectBack: draft.aspectBack,
          ...(slot === edit.slot ? { placement } : {}),
          name: draft.name.trim() || draft.category,
          category: draft.category,
          slot,
          colors: draft.colors,
          colorName: colorName(draft.colors[0]?.hex ?? '#888888'),
          seasons: draft.seasons,
          styles: draft.styles,
          pattern: draft.pattern,
          brand: draft.brand.trim(),
          notes: draft.notes.trim(),
          favorite: draft.favorite,
          imageFront: draft.imageFront,
          imageBack: draft.imageBack,
          thumb: draft.thumb,
        })
        onSaved?.({ ...(edit as Item) })
      } else {
        const item: Item = {
          id: draft.id,
          name: draft.name.trim() || draft.category,
          category: draft.category,
          slot,
          colors: draft.colors,
          colorName: colorName(draft.colors[0]?.hex ?? '#888888'),
          seasons: draft.seasons,
          styles: draft.styles,
          pattern: draft.pattern,
          brand: draft.brand.trim(),
          notes: draft.notes.trim(),
          favorite: draft.favorite,
          createdAt: Date.now(),
          wearCount: 0,
          lastWorn: null,
          imageFront: draft.imageFront,
          imageBack: draft.imageBack,
          thumb: draft.thumb,
          aspect: draft.aspect,
          aspectBack: draft.aspectBack,
          placement: newPlacement(slot, draft.aspect, draft.aspectBack),
        }
        await addItem(item)
        onSaved?.(item)
      }

      // Foto ist jetzt ein fertiges Teil – aus der Warteschlange nehmen.
      if (currentPending.current) {
        await deletePending(currentPending.current)
        currentPending.current = null
        await refreshPending()
      }

      // Mehrere Fotos auf einmal ausgewählt? Direkt mit dem nächsten weitermachen.
      if (queue.length && (await startPending(queue))) return
      onClose()
    } finally {
      setWorking(null)
    }
  }

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

  const mainColor = draft.colors[0]?.hex ?? '#888888'

  const title =
    step === 'quelle'
      ? 'Neues Teil'
      : step === 'freistellen'
        ? pendingView.current === 'back'
          ? 'Rückseite freistellen'
          : 'Freistellen'
        : edit
          ? 'Teil bearbeiten'
          : 'Details'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {title}
          {queue.length > 0 && (
            <span className="rounded-full bg-sand-300/20 px-2 py-0.5 text-[11px] text-sand-200">
              noch {queue.length}
            </span>
          )}
        </span>
      }
      full={step !== 'quelle'}
      footer={
        step === 'details' ? (
          <div className="flex gap-2">
            <Button variant="subtle" onClick={onClose} className="flex-1">
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={!draft.imageFront || !!working}
              className="flex-[1.6]"
            >
              <Icon name="check" size={17} />
              {queue.length ? 'Speichern & weiter' : 'Speichern'}
            </Button>
          </div>
        ) : undefined
      }
    >
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void pickFiles(e.target.files, pendingView.current)
          e.target.value = ''
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void pickFiles(e.target.files, pendingView.current)
          e.target.value = ''
        }}
      />

      {step === 'quelle' && (
        <div className="space-y-3 py-2">
          {pendingCount > 0 && (
            <div className="rounded-2xl border border-sand-300/30 bg-sand-300/10 p-3.5">
              <p className="text-[13px] text-sand-100">
                {pendingCount === 1 ? '1 Foto wartet' : `${pendingCount} Fotos warten`} noch aufs
                Freistellen.
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    setWorking('Fotos werden geladen …')
                    void pendingIds()
                      .then(startPending)
                      .finally(() => setWorking(null))
                  }}
                >
                  Weitermachen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void discardPending()}>
                  Verwerfen
                </Button>
              </div>
            </div>
          )}
          <p className="text-[13.5px] leading-relaxed text-white/50">
            Leg das Teil flach hin – am besten auf einen ruhigen, einfarbigen Untergrund und mit
            gutem Licht. Das erkennt die KI am zuverlässigsten.
          </p>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              pendingView.current = 'front'
              camRef.current?.click()
            }}
          >
            <Icon name="camera" size={19} /> Foto aufnehmen
          </Button>
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              pendingView.current = 'front'
              fileRef.current?.click()
            }}
          >
            <Icon name="image" size={19} /> Aus der Galerie wählen
          </Button>
          <p className="pt-1 text-center text-[12px] text-white/30">
            Du kannst mehrere Bilder gleichzeitig auswählen – sie werden dann nacheinander
            abgearbeitet.
          </p>
        </div>
      )}

      {step === 'freistellen' && source && (
        <div className="h-full">
          <CutoutEditor
            source={source}
            quality={settings.aiQuality}
            autoRun={settings.aiAutoRun}
            onDone={handleCutoutDone}
            onBack={() => {
              setSource(null)
              setStep(draft.imageFront ? 'details' : 'quelle')
            }}
            label={pendingView.current === 'back' ? 'Rückseite' : 'Vorderseite'}
          />
        </div>
      )}

      {step === 'details' && (
        <div className="space-y-5 pb-2">
          <div className="grid grid-cols-2 gap-3">
            {(['front', 'back'] as View[]).map((v) => {
              const url = v === 'front' ? preview.front : preview.back
              return (
                <button
                  key={v}
                  onClick={() => {
                    pendingView.current = v
                    camRef.current?.click()
                  }}
                  className="checker group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-ink-700"
                >
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-contain p-2" />
                  ) : (
                    <span className="flex flex-col items-center gap-1.5 text-[12px] text-white/40">
                      <Icon name="camera" size={22} />
                      {v === 'front' ? 'Vorderseite' : 'Rückseite'}
                      <span className="text-[10.5px] text-white/25">tippen zum Fotografieren</span>
                    </span>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-ink-950/75 px-2 py-0.5 text-[10.5px] text-white/70">
                    {v === 'front' ? 'Vorne' : 'Hinten'}
                  </span>
                  {url && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-ink-950/75 px-2 py-0.5 text-[10.5px] text-white/60 opacity-0 transition-opacity group-hover:opacity-100">
                      ersetzen
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {!draft.imageBack && (
            <p className="-mt-3 text-[12px] leading-relaxed text-white/35">
              Die Rückseite ist optional – ohne sie zeigt die Figur in der Rückansicht das
              Vorderbild leicht abgeblendet.
            </p>
          )}

          {aiNote && (
            <div className="rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-2.5 text-[12.5px] text-white/60">
              {aiNote}
            </div>
          )}

          <Field label="Name">
            <input
              className={inputClass}
              value={draft.name}
              placeholder={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>

          <Field label="Kategorie">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.name}
                  active={draft.category === c.name}
                  onClick={() => setDraft((d) => ({ ...d, category: c.name }))}
                >
                  {c.name}
                </Chip>
              ))}
            </div>
          </Field>

          {draft.colors.length > 0 && (
            <Field label="Farbe" hint="Tippe die Farbe an, die das Teil am besten beschreibt.">
              <div className="flex flex-wrap gap-2">
                {draft.colors.map((c, i) => (
                  <button
                    key={c.hex + i}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        colors: [c, ...d.colors.filter((x) => x.hex !== c.hex)],
                      }))
                    }
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] ${
                      mainColor === c.hex ? 'border-sand-300' : 'border-ink-600'
                    }`}
                    style={{ background: c.hex, color: textOn(c.hex) }}
                  >
                    {colorName(c.hex)}
                    <span className="opacity-60">{Math.round(c.ratio * 100)} %</span>
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Muster">
            <div className="flex flex-wrap gap-1.5">
              {PATTERNS.map((p) => (
                <Chip
                  key={p}
                  active={draft.pattern === p}
                  onClick={() => setDraft((d) => ({ ...d, pattern: p }))}
                >
                  {p}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Passt zu" hint="Leer lassen heißt: passt immer.">
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((s) => (
                <Chip
                  key={s}
                  active={draft.styles.includes(s)}
                  onClick={() => setDraft((d) => ({ ...d, styles: toggle(d.styles, s) }))}
                >
                  {s}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Jahreszeit">
            <div className="flex flex-wrap gap-1.5">
              {SEASONS.map((s) => (
                <Chip
                  key={s}
                  active={draft.seasons.includes(s)}
                  onClick={() => setDraft((d) => ({ ...d, seasons: toggle(d.seasons, s) }))}
                >
                  {s}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Marke">
              <input
                className={inputClass}
                value={draft.brand}
                placeholder="optional"
                onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
              />
            </Field>
            <Field label="Notiz">
              <input
                className={inputClass}
                value={draft.notes}
                placeholder="optional"
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </Field>
          </div>

          <button
            onClick={() => setDraft((d) => ({ ...d, favorite: !d.favorite }))}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13.5px] ${
              draft.favorite
                ? 'border-sand-300 bg-sand-300/15 text-sand-100'
                : 'border-ink-700 bg-ink-850 text-white/55'
            }`}
          >
            <Icon name="star" size={17} /> {draft.favorite ? 'Lieblingsteil' : 'Als Liebling merken'}
          </button>
        </div>
      )}

      {working && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl bg-ink-800 px-5 py-4 text-[13.5px]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-sand-300" />
            {working}
          </div>
        </div>
      )}
    </Sheet>
  )
}

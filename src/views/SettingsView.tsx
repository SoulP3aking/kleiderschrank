import { useEffect, useRef, useState } from 'react'
import { CutoutEditor } from '../components/CutoutEditor'
import { FigureStage } from '../components/FigureStage'
import { Button, Chip, Field, Icon, Sheet, Slider } from '../components/ui'
import { aiPreload, aiSupported, onAiProgress, type AiProgress } from '../lib/ai'
import { exportBackup, formatBytes, importBackup } from '../lib/backup'
import { putImage, requestPersistence, storageEstimate, wipeAll } from '../lib/db'
import { canvasToBlob, imageDataToCanvas, loadScaled, resizeImageData } from '../lib/image'
import { forgetAllImages, forgetImage } from '../lib/imageUrls'
import { useStore } from '../lib/store'
import { DEFAULT_FIGURE, type AiQuality, type Figure, type View } from '../lib/types'

const QUALITY_HINT: Record<AiQuality, string> = {
  auto: 'Empfohlen. Nutzt die Grafikeinheit, wenn dein Handy das kann (84 MB, ca. 1 s pro Foto) – sonst das kleine Modell (42 MB).',
  schnell: 'Kleinster Download (42 MB). Rechnet auf dem Prozessor, einige Sekunden pro Foto.',
  gut: 'Beste Kanten. Ohne Grafikeinheit 168 MB Download und deutlich langsamer.',
}

const SKIN_TONES = [
  '#f3d9c4',
  '#e8bf9a',
  '#d9a377',
  '#c9885c',
  '#a96a44',
  '#82502f',
  '#5d3720',
  '#3d2416',
]

export function SettingsView({ onToast }: { onToast: (t: string) => void }) {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const reloadAll = useStore((s) => s.reloadAll)
  const items = useStore((s) => s.items)
  const outfits = useStore((s) => s.outfits)

  const [view, setView] = useState<View>('front')
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<AiProgress | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [photoSource, setPhotoSource] = useState<{ data: ImageData; view: View } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const photoInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const pendingPhotoView = useRef<View>('front')
  const importMode = useRef<'ersetzen' | 'hinzufügen'>('hinzufügen')

  const figure = settings.figure
  const setFigure = (patch: Partial<Figure>) => updateSettings({ figure: { ...figure, ...patch } })

  useEffect(() => onAiProgress(setProgress), [])
  useEffect(() => {
    void storageEstimate().then(setStorage)
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [items.length, outfits.length])

  const handlePhoto = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy('Foto wird geladen …')
    try {
      const data = await loadScaled(files[0], 1200)
      setPhotoSource({ data, view: pendingPhotoView.current })
    } finally {
      setBusy(null)
    }
  }

  const savePhoto = async (result: ImageData) => {
    setBusy('Wird gespeichert …')
    try {
      const sized = resizeImageData(result, 1000)
      const blob = await canvasToBlob(imageDataToCanvas(sized))
      const key = await putImage(blob)
      const which = photoSource!.view
      forgetImage(which === 'front' ? figure.photoFront : figure.photoBack)
      // Ein einziger Aufruf – zwei nacheinander würden mit dem alten Stand überschreiben.
      await setFigure({
        ...(which === 'front' ? { photoFront: key } : { photoBack: key }),
        mode: 'foto',
      })
      setPhotoSource(null)
    } finally {
      setBusy(null)
    }
  }

  const preloadModels = async () => {
    setBusy('Modelle werden geladen …')
    try {
      await aiPreload('segment', settings.aiQuality)
      await aiPreload('classify', settings.aiQuality)
      onToast('Modelle liegen jetzt offline bereit')
    } catch {
      onToast('Download fehlgeschlagen – Internet prüfen')
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  if (photoSource) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-ink-950 px-4 pb-[calc(var(--safe-b)+1rem)] pt-[calc(var(--safe-t)+1rem)]">
        <CutoutEditor
          source={photoSource.data}
          quality={settings.aiQuality}
          autoRun={settings.aiAutoRun}
          label={photoSource.view === 'front' ? 'Figur vorne' : 'Figur hinten'}
          onBack={() => setPhotoSource(null)}
          onDone={savePhoto}
        />
      </div>
    )
  }

  return (
    <div className="space-y-7 pb-6">
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handlePhoto(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={backupInput}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy('Backup wird eingespielt …')
          try {
            const res = await importBackup(file, importMode.current, (t) => setBusy(t))
            forgetAllImages()
            await reloadAll()
            onToast(`${res.items} Teile und ${res.outfits} Outfits eingespielt`)
            setImportOpen(false)
          } catch (err) {
            onToast((err as Error).message)
          } finally {
            setBusy(null)
          }
        }}
      />

      {/* ---------- Figur ---------- */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Deine Figur</h2>
        <div className="flex gap-4">
          <div className="w-[120px] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-ink-850 to-ink-900">
            <FigureStage items={[]} view={view} figure={figure} className="!max-w-none" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex gap-1 rounded-full bg-ink-850 p-1">
              {(
                [
                  ['silhouette', 'Silhouette'],
                  ['foto', 'Eigenes Foto'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFigure({ mode: id })}
                  className={`flex-1 rounded-full px-2 py-1.5 text-[12px] ${
                    figure.mode === id ? 'bg-ink-700 text-white' : 'text-white/45'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-full bg-ink-850 p-1">
              {(['front', 'back'] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex-1 rounded-full px-2 py-1.5 text-[12px] ${
                    view === v ? 'bg-ink-700 text-white' : 'text-white/45'
                  }`}
                >
                  {v === 'front' ? 'Vorne' : 'Hinten'}
                </button>
              ))}
            </div>
            {figure.mode === 'silhouette' ? (
              <div className="flex flex-wrap gap-1.5">
                {(['weiblich', 'neutral', 'männlich'] as const).map((s) => (
                  <Chip key={s} active={figure.shape === s} onClick={() => setFigure({ shape: s })}>
                    {s}
                  </Chip>
                ))}
              </div>
            ) : (
              <Button
                size="sm"
                variant="subtle"
                className="w-full"
                onClick={() => {
                  pendingPhotoView.current = view
                  photoInput.current?.click()
                }}
              >
                <Icon name="camera" size={15} />
                {(view === 'front' ? figure.photoFront : figure.photoBack)
                  ? 'Foto ersetzen'
                  : 'Foto wählen'}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {figure.mode === 'silhouette' ? (
            <>
              <Field label="Hautton">
                <div className="flex flex-wrap gap-2">
                  {SKIN_TONES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setFigure({ skin: t })}
                      className={`h-8 w-8 rounded-full border-2 ${
                        figure.skin === t ? 'border-sand-300' : 'border-ink-700'
                      }`}
                      style={{ background: t }}
                      aria-label={t}
                    />
                  ))}
                </div>
              </Field>
              <Slider
                label="Statur (Breite)"
                min={0.85}
                max={1.2}
                step={0.01}
                value={figure.width}
                display={`${Math.round(figure.width * 100)} %`}
                onChange={(v) => setFigure({ width: v })}
              />
              <Slider
                label="Größe"
                min={0.9}
                max={1.1}
                step={0.01}
                value={figure.height}
                display={`${Math.round(figure.height * 100)} %`}
                onChange={(v) => setFigure({ height: v })}
              />
            </>
          ) : (
            <>
              <Slider
                label="Deckkraft des Fotos"
                min={0.15}
                max={1}
                step={0.05}
                value={figure.photoOpacity}
                display={`${Math.round(figure.photoOpacity * 100)} %`}
                onChange={(v) => setFigure({ photoOpacity: v })}
              />
              <p className="text-[12px] leading-relaxed text-white/35">
                Am besten ein Ganzkörperfoto in enger, heller Kleidung, gerade von vorne bzw.
                hinten. Der Hintergrund wird beim Hinzufügen automatisch entfernt.
              </p>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFigure({ ...DEFAULT_FIGURE, photoFront: figure.photoFront, photoBack: figure.photoBack })}
          >
            <Icon name="undo" size={15} /> Figur zurücksetzen
          </Button>
        </div>
      </section>

      {/* ---------- KI ---------- */}
      <section>
        <h2 className="mb-1 text-[15px] font-semibold">Automatik</h2>
        <p className="mb-3 text-[12.5px] leading-relaxed text-white/40">
          Freistellen und Erkennen laufen direkt auf deinem Gerät. Die Modelle werden einmalig
          geladen und danach im Browser behalten – deine Fotos werden nie hochgeladen.
        </p>
        <div className="space-y-3 rounded-2xl bg-ink-900 p-4">
          <Field label="Freisteller" hint={QUALITY_HINT[settings.aiQuality]}>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['auto', 'Automatisch'],
                  ['schnell', 'Sparsam'],
                  ['gut', 'Maximal'],
                ] as const
              ).map(([id, label]) => (
                <Chip
                  key={id}
                  active={settings.aiQuality === id}
                  onClick={() => updateSettings({ aiQuality: id })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </Field>
          <Toggle
            label="Beim Hinzufügen automatisch freistellen"
            value={settings.aiAutoRun}
            onChange={(v) => updateSettings({ aiAutoRun: v })}
          />
          <Toggle
            label="Kategorie automatisch erkennen"
            value={settings.aiClassify}
            onChange={(v) => updateSettings({ aiClassify: v })}
          />
          <Button
            variant="subtle"
            className="w-full"
            onClick={preloadModels}
            disabled={!!busy || !aiSupported()}
          >
            <Icon name="download" size={16} /> Modelle jetzt für offline laden
          </Button>
          {progress && (
            <div>
              <div className="mb-1 text-[12px] text-white/50">{progress.text}</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-sand-300 transition-[width]"
                  style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                />
              </div>
            </div>
          )}
          {!aiSupported() && (
            <p className="text-[12px] text-amber-200/80">
              Dieser Browser unterstützt die lokale KI nicht – Zauberstab und Radierer
              funktionieren trotzdem.
            </p>
          )}
        </div>
      </section>

      {/* ---------- Daten ---------- */}
      <section>
        <h2 className="mb-1 text-[15px] font-semibold">Daten & Sicherung</h2>
        <p className="mb-3 text-[12.5px] leading-relaxed text-white/40">
          Alles liegt ausschließlich in diesem Browser. Lösche die Browserdaten oder wechsle das
          Gerät, ist der Schrank weg – mach also ab und zu ein Backup.
        </p>
        <div className="space-y-3 rounded-2xl bg-ink-900 p-4">
          <div className="flex justify-between text-[13px]">
            <span className="text-white/45">Im Schrank</span>
            <span>
              {items.length} Teile · {outfits.length} Outfits
            </span>
          </div>
          {storage && (
            <div className="flex justify-between text-[13px]">
              <span className="text-white/45">Belegter Speicher</span>
              <span>
                {formatBytes(storage.usage)}
                {storage.quota ? ` von ${formatBytes(storage.quota)}` : ''}
              </span>
            </div>
          )}
          <Button
            variant="primary"
            className="w-full"
            disabled={!!busy}
            onClick={async () => {
              setBusy('Backup wird erstellt …')
              try {
                const res = await exportBackup((t) => setBusy(t))
                onToast(`Backup erstellt (${formatBytes(res.bytes)})`)
              } catch {
                onToast('Backup fehlgeschlagen')
              } finally {
                setBusy(null)
              }
            }}
          >
            <Icon name="download" size={16} /> Backup herunterladen (ZIP)
          </Button>
          <Button variant="subtle" className="w-full" onClick={() => setImportOpen(true)}>
            <Icon name="share" size={16} /> Backup einspielen
          </Button>
          {persisted === false && (
            <Button
              variant="subtle"
              className="w-full"
              onClick={async () => {
                const ok = await requestPersistence()
                setPersisted(ok)
                onToast(
                  ok
                    ? 'Der Browser räumt deine Daten jetzt nicht mehr automatisch weg'
                    : 'Der Browser hat das abgelehnt – Backups sind umso wichtiger',
                )
              }}
            >
              <Icon name="check" size={16} /> Daten dauerhaft speichern
            </Button>
          )}
          {persisted && (
            <p className="text-[12px] text-white/35">
              ✓ Der Browser hat zugesagt, diese Daten nicht automatisch zu löschen.
            </p>
          )}
          <Button variant="ghost" className="w-full" onClick={() => setWipeOpen(true)}>
            <Icon name="trash" size={16} /> Alles löschen
          </Button>
        </div>
      </section>

      <p className="px-1 text-center text-[11.5px] leading-relaxed text-white/25">
        Digitaler Kleiderschrank · läuft offline · keine Konten, keine Server, keine Kosten
      </p>

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Backup einspielen">
        <div className="space-y-3 pb-2">
          <p className="text-[13px] leading-relaxed text-white/50">
            Wähle eine ZIP-Datei, die du vorher hier exportiert hast.
          </p>
          <Button
            variant="subtle"
            className="w-full"
            onClick={() => {
              importMode.current = 'hinzufügen'
              backupInput.current?.click()
            }}
          >
            Dazupacken – vorhandene Teile bleiben
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              importMode.current = 'ersetzen'
              backupInput.current?.click()
            }}
          >
            Alles ersetzen – aktueller Schrank wird gelöscht
          </Button>
        </div>
      </Sheet>

      <Sheet open={wipeOpen} onClose={() => setWipeOpen(false)} title="Wirklich alles löschen?">
        <div className="space-y-3 pb-2">
          <p className="text-[13px] leading-relaxed text-white/60">
            Alle {items.length} Teile, {outfits.length} Outfits, Kalendereinträge und Einstellungen
            werden unwiderruflich gelöscht. Lade dir vorher ein Backup herunter, wenn du dir nicht
            sicher bist.
          </p>
          <Button variant="subtle" className="w-full" onClick={() => setWipeOpen(false)}>
            Abbrechen
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              await wipeAll()
              forgetAllImages()
              await reloadAll()
              setWipeOpen(false)
              onToast('Alles gelöscht')
            }}
          >
            Ja, alles löschen
          </Button>
        </div>
      </Sheet>

      {busy && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/70 px-8 backdrop-blur-sm">
          <div className="flex max-w-xs items-center gap-3 rounded-2xl bg-ink-800 px-5 py-4 text-center text-[13px]">
            <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-sand-300" />
            {busy}
          </div>
        </div>
      )}
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="text-[13.5px] text-white/75">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? 'bg-sand-300' : 'bg-ink-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            value ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}

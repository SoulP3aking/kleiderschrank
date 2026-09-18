import { useMemo, useState } from 'react'
import { FigureStage } from '../components/FigureStage'
import { ItemThumb } from '../components/ItemTile'
import { Button, Empty, Icon, Sheet, Slider, inputClass } from '../components/ui'
import { uid } from '../lib/db'
import { renderOutfitPng, shareOrDownload } from '../lib/exportImage'
import { canvasToBlob } from '../lib/image'
import { putImage } from '../lib/db'
import { useStore } from '../lib/store'
import { suggestOutfits } from '../lib/suggest'
import {
  fitPlacement,
  SLOT_LABEL,
  SLOT_ORDER,
  type Item,
  type Outfit,
  type Slot,
  type View,
} from '../lib/types'

export function StudioView({
  worn,
  setWorn,
  onToast,
  onOpenSettings,
}: {
  worn: string[]
  setWorn: (ids: string[]) => void
  onToast: (t: string) => void
  onOpenSettings: () => void
}) {
  const items = useStore((s) => s.items)
  const settings = useStore((s) => s.settings)
  const setPlacement = useStore((s) => s.setPlacement)
  const saveOutfit = useStore((s) => s.saveOutfit)
  const markWorn = useStore((s) => s.markWorn)

  const [view, setView] = useState<View>('front')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shelfSlot, setShelfSlot] = useState<Slot>('oberteil')
  const [saveOpen, setSaveOpen] = useState(false)
  const [outfitName, setOutfitName] = useState('')
  const [busy, setBusy] = useState(false)

  const wornItems = useMemo(
    () => worn.map((id) => items.find((i) => i.id === id)).filter((x): x is Item => !!x),
    [worn, items],
  )
  const selected = wornItems.find((i) => i.id === selectedId) ?? null
  const shelf = useMemo(() => items.filter((i) => i.slot === shelfSlot), [items, shelfSlot])

  const toggleItem = (item: Item) => {
    if (worn.includes(item.id)) {
      setWorn(worn.filter((id) => id !== item.id))
      if (selectedId === item.id) setSelectedId(null)
      return
    }
    // Pro Ebene nur ein Teil – außer bei Accessoires.
    const keep =
      item.slot === 'accessoire'
        ? worn
        : worn.filter((id) => items.find((i) => i.id === id)?.slot !== item.slot)
    // Kleid und Oberteil/Unterteil schließen sich gegenseitig aus.
    const cleaned =
      item.slot === 'einteiler'
        ? keep.filter((id) => !['oberteil', 'unterteil'].includes(items.find((i) => i.id === id)?.slot ?? ''))
        : item.slot === 'oberteil' || item.slot === 'unterteil'
          ? keep.filter((id) => items.find((i) => i.id === id)?.slot !== 'einteiler')
          : keep
    setWorn([...cleaned, item.id])
    setSelectedId(item.id)
  }

  const randomOutfit = () => {
    const picks = suggestOutfits(items, { seed: Math.floor(Math.random() * 99999), limit: 6 })
    if (!picks.length) {
      onToast('Zu wenig Teile für einen Vorschlag')
      return
    }
    const pick = picks[Math.floor(Math.random() * picks.length)]
    setWorn(pick.itemIds)
    setSelectedId(null)
    onToast(pick.reasons[0] ?? 'Zufallsoutfit')
  }

  const exportImage = async () => {
    if (!wornItems.length) return
    setBusy(true)
    try {
      const blob = await renderOutfitPng(wornItems, view, settings.figure, {
        title: outfitName || 'Mein Outfit',
      })
      const result = await shareOrDownload(blob, 'outfit.png')
      onToast(result === 'abgebrochen' ? 'Abgebrochen' : `Bild ${result}`)
    } catch {
      onToast('Bild konnte nicht erstellt werden')
    } finally {
      setBusy(false)
    }
  }

  const doSave = async () => {
    setBusy(true)
    try {
      const png = await renderOutfitPng(wornItems, 'front', settings.figure, { mode: 'figur' })
      // Kleines Vorschaubild, damit die Outfit-Liste schnell bleibt
      const bmp = await createImageBitmap(png)
      const c = document.createElement('canvas')
      c.width = 300
      c.height = 600
      c.getContext('2d')!.drawImage(bmp, 0, 0, 300, 600)
      bmp.close()
      const cover = await putImage(await canvasToBlob(c))
      const outfit: Outfit = {
        id: uid(),
        name: outfitName.trim() || `Outfit ${new Date().toLocaleDateString('de-DE')}`,
        itemIds: worn,
        createdAt: Date.now(),
        favorite: false,
        note: '',
        cover,
      }
      await saveOutfit(outfit)
      setSaveOpen(false)
      setOutfitName('')
      onToast('Outfit gespeichert')
    } finally {
      setBusy(false)
    }
  }

  if (!items.length) {
    return (
      <Empty
        title="Noch nichts zum Anziehen"
        text="Sobald du Teile im Schrank hast, kannst du sie hier auf die Figur ziehen und Outfits zusammenstellen."
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex gap-1 rounded-full bg-ink-850 p-1">
          {(['front', 'back'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${
                view === v ? 'bg-sand-300 text-ink-950 font-medium' : 'text-white/55'
              }`}
            >
              {v === 'front' ? 'Vorne' : 'Hinten'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onOpenSettings}>
            <Icon name="person" size={16} /> Figur
          </Button>
          <Button size="sm" variant="ghost" onClick={randomOutfit}>
            <Icon name="shuffle" size={16} /> Würfeln
          </Button>
          {worn.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setWorn([])
                setSelectedId(null)
              }}
            >
              <Icon name="x" size={16} />
            </Button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <FigureStage
          items={wornItems}
          view={view}
          figure={settings.figure}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onPlacementChange={(id, patch) => setPlacement(id, view, patch)}
          editable
          className="h-full bg-gradient-to-b from-ink-900 to-ink-850"
        />
        {!worn.length && (
          <div className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-[12.5px] text-white/35">
            Tippe unten ein Teil an, um es anzuziehen
          </div>
        )}
        {worn.length > 0 && !selected && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-white/30">
            Teil antippen · ziehen · mit zwei Fingern skalieren & drehen
          </div>
        )}
      </div>

      {selected ? (
        <div className="mt-2 rounded-2xl border border-ink-700 bg-ink-850 px-3 pb-1 pt-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium">{selected.name}</span>
            <div className="flex gap-1">
              <IconBtn
                title="Spiegeln"
                icon="flip"
                onClick={() =>
                  setPlacement(selected.id, view, { flip: !selected.placement[view].flip })
                }
              />
              <IconBtn
                title="Nach vorne"
                icon="layers"
                onClick={() =>
                  setPlacement(selected.id, view, {
                    zOffset: Math.min(9, selected.placement[view].zOffset + 1),
                  })
                }
              />
              <IconBtn
                title="Nach hinten"
                icon="layers"
                flip
                onClick={() =>
                  setPlacement(selected.id, view, {
                    zOffset: Math.max(-9, selected.placement[view].zOffset - 1),
                  })
                }
              />
              <IconBtn
                title="Zurücksetzen"
                icon="undo"
                onClick={() =>
                  setPlacement(
                    selected.id,
                    view,
                    fitPlacement(
                      selected.slot,
                      (view === 'back' ? selected.aspectBack : null) ?? selected.aspect ?? 1,
                    ),
                  )
                }
              />
              <IconBtn
                title="Ausziehen"
                icon="trash"
                onClick={() => {
                  setWorn(worn.filter((id) => id !== selected.id))
                  setSelectedId(null)
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Slider
              label="Größe"
              min={0.08}
              max={1.8}
              step={0.01}
              value={selected.placement[view].scale}
              display={`${Math.round(selected.placement[view].scale * 100)} %`}
              onChange={(v) => setPlacement(selected.id, view, { scale: v })}
            />
            <Slider
              label="Drehung"
              min={-45}
              max={45}
              step={1}
              value={selected.placement[view].rotation}
              display={`${Math.round(selected.placement[view].rotation)}°`}
              onChange={(v) => setPlacement(selected.id, view, { rotation: v })}
            />
          </div>
        </div>
      ) : (
        worn.length > 0 && (
          <div className="mt-2 flex gap-2">
            <Button variant="subtle" className="flex-1" onClick={exportImage} disabled={busy}>
              <Icon name="share" size={16} /> Als Bild
            </Button>
            <Button
              variant="subtle"
              className="flex-1"
              onClick={async () => {
                await markWorn(worn)
                onToast('Als heute getragen vermerkt')
              }}
            >
              <Icon name="check" size={16} /> Getragen
            </Button>
            <Button variant="primary" className="flex-[1.3]" onClick={() => setSaveOpen(true)}>
              <Icon name="star" size={16} /> Speichern
            </Button>
          </div>
        )
      )}

      <div className="mt-2">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-2">
          {SLOT_ORDER.map((s) => {
            const n = items.filter((i) => i.slot === s).length
            if (!n) return null
            return (
              <button
                key={s}
                onClick={() => setShelfSlot(s)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] transition-colors ${
                  shelfSlot === s ? 'bg-ink-700 text-white' : 'bg-ink-850 text-white/45'
                }`}
              >
                {SLOT_LABEL[s]}
              </button>
            )
          })}
        </div>
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
          {shelf.length === 0 && (
            <div className="px-1 py-6 text-[12.5px] text-white/30">
              Keine Teile in dieser Kategorie.
            </div>
          )}
          {shelf.map((item) => {
            const on = worn.includes(item.id)
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item)}
                className={`relative w-[66px] shrink-0 overflow-hidden rounded-xl border transition-colors ${
                  on ? 'border-sand-300' : 'border-ink-700'
                }`}
              >
                <ItemThumb item={item} className="aspect-square w-full" pad="p-1.5" />
                {on && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sand-300 text-ink-950">
                    <Icon name="check" size={12} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <Sheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Outfit speichern"
        footer={
          <Button variant="primary" className="w-full" onClick={doSave} disabled={busy}>
            {busy ? 'Speichert …' : 'Speichern'}
          </Button>
        }
      >
        <div className="space-y-3 py-1">
          <input
            autoFocus
            className={inputClass}
            value={outfitName}
            placeholder="z. B. Büro Montag"
            onChange={(e) => setOutfitName(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {wornItems.map((i) => (
              <span key={i.id} className="rounded-full bg-ink-800 px-2.5 py-1 text-[12px] text-white/60">
                {i.name}
              </span>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  )
}

function IconBtn({
  icon,
  onClick,
  title,
  flip,
}: {
  icon: string
  onClick: () => void
  title: string
  flip?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-lg bg-ink-800 p-1.5 text-white/60 transition-colors hover:bg-ink-700 hover:text-white"
    >
      <Icon name={icon} size={16} className={flip ? 'rotate-180' : ''} />
    </button>
  )
}

import { useMemo, useState } from 'react'
import { ItemTile } from '../components/ItemTile'
import { Button, Chip, Empty, Icon, Sheet } from '../components/ui'
import { colorName, textOn } from '../lib/color'
import { useImageUrl } from '../lib/imageUrls'
import { useStore } from '../lib/store'
import { SLOT_LABEL, SLOT_ORDER, type Item, type Slot, type View } from '../lib/types'

type Sort = 'neu' | 'name' | 'oft' | 'selten'

export function WardrobeView({
  onEdit,
  onWear,
  onToast,
}: {
  onEdit: (item: Item) => void
  onWear: (item: Item) => void
  onToast: (text: string) => void
}) {
  const items = useStore((s) => s.items)
  const removeItem = useStore((s) => s.removeItem)
  const markWorn = useStore((s) => s.markWorn)
  const updateItem = useStore((s) => s.updateItem)

  const [slot, setSlot] = useState<Slot | 'alle' | 'favoriten'>('alle')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('neu')
  const [open, setOpen] = useState<Item | null>(null)
  const [confirm, setConfirm] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = items.filter((i) => {
      if (slot === 'favoriten' && !i.favorite) return false
      if (slot !== 'alle' && slot !== 'favoriten' && i.slot !== slot) return false
      if (!q) return true
      return (
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.brand.toLowerCase().includes(q) ||
        i.colorName.toLowerCase().includes(q)
      )
    })
    list = [...list]
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'de'))
    if (sort === 'oft') list.sort((a, b) => b.wearCount - a.wearCount)
    if (sort === 'selten') list.sort((a, b) => a.wearCount - b.wearCount)
    return list
  }, [items, slot, query, sort])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach((i) => map.set(i.slot, (map.get(i.slot) ?? 0) + 1))
    return map
  }, [items])

  const current = open ? items.find((i) => i.id === open.id) ?? null : null

  return (
    <div className="pb-4">
      <div className="sticky top-0 z-10 -mx-4 bg-ink-950/92 px-4 pb-2 pt-1 backdrop-blur">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen: Name, Marke, Farbe …"
            className="w-full rounded-xl border border-ink-700 bg-ink-850 py-2.5 pl-10 pr-3 text-[14px] outline-none placeholder:text-white/25 focus:border-sand-400"
          />
          <Icon
            name="grid"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
          />
        </div>
        <div className="scrollbar-none mt-2 flex gap-1.5 overflow-x-auto pb-1">
          <Chip active={slot === 'alle'} onClick={() => setSlot('alle')}>
            Alle {items.length}
          </Chip>
          <Chip active={slot === 'favoriten'} onClick={() => setSlot('favoriten')}>
            ★ Lieblinge
          </Chip>
          {SLOT_ORDER.filter((s) => counts.get(s)).map((s) => (
            <Chip key={s} active={slot === s} onClick={() => setSlot(s)}>
              {SLOT_LABEL[s]} {counts.get(s)}
            </Chip>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <Empty
          title="Dein Schrank ist noch leer"
          text="Fotografiere dein erstes Kleidungsstück – am besten flach auf einem einfarbigen Untergrund. Den Hintergrund schneidet die App automatisch weg."
        />
      ) : filtered.length === 0 ? (
        <Empty title="Nichts gefunden" text="Andere Suche oder anderen Filter probieren." />
      ) : (
        <>
          <div className="mb-2 mt-1 flex items-center justify-between px-0.5">
            <span className="text-[12px] text-white/35">{filtered.length} Teile</span>
            <div className="flex gap-1">
              {(
                [
                  ['neu', 'Neueste'],
                  ['name', 'A–Z'],
                  ['oft', 'Oft getragen'],
                  ['selten', 'Selten'],
                ] as [Sort, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setSort(id)}
                  className={`rounded-lg px-2 py-1 text-[11.5px] ${
                    sort === id ? 'bg-ink-700 text-white' : 'text-white/35'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {filtered.map((item) => (
              <ItemTile
                key={item.id}
                item={item}
                onClick={() => setOpen(item)}
                badge={sort === 'oft' || sort === 'selten' ? `${item.wearCount}×` : undefined}
              />
            ))}
          </div>
        </>
      )}

      <Sheet
        open={!!current}
        onClose={() => {
          setOpen(null)
          setConfirm(false)
        }}
        title={current?.name}
      >
        {current && (
          <ItemDetail
            item={current}
            confirm={confirm}
            setConfirm={setConfirm}
            onEdit={() => {
              onEdit(current)
              setOpen(null)
            }}
            onWear={() => {
              onWear(current)
              setOpen(null)
            }}
            onDelete={async () => {
              await removeItem(current.id)
              setOpen(null)
              setConfirm(false)
              onToast('Teil gelöscht')
            }}
            onMarkWorn={async () => {
              await markWorn([current.id])
              onToast('Als heute getragen vermerkt')
            }}
            onToggleFavorite={() => updateItem(current.id, { favorite: !current.favorite })}
          />
        )}
      </Sheet>
    </div>
  )
}

function ItemDetail({
  item,
  confirm,
  setConfirm,
  onEdit,
  onWear,
  onDelete,
  onMarkWorn,
  onToggleFavorite,
}: {
  item: Item
  confirm: boolean
  setConfirm: (v: boolean) => void
  onEdit: () => void
  onWear: () => void
  onDelete: () => void
  onMarkWorn: () => void
  onToggleFavorite: () => void
}) {
  const [view, setView] = useState<View>('front')
  const url = useImageUrl(view === 'back' ? item.imageBack ?? item.imageFront : item.imageFront)

  return (
    <div className="space-y-4 pb-2">
      <div className="checker relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-ink-700">
        {url && <img src={url} alt={item.name} className="h-full w-full object-contain p-3" />}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-ink-950/80 p-1 backdrop-blur">
          {(['front', 'back'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-[12px] ${
                view === v ? 'bg-sand-300 text-ink-950' : 'text-white/60'
              }`}
            >
              {v === 'front' ? 'Vorne' : 'Hinten'}
            </button>
          ))}
        </div>
        {view === 'back' && !item.imageBack && (
          <span className="absolute left-3 top-3 rounded-full bg-ink-950/80 px-2.5 py-1 text-[11px] text-white/55">
            Kein Rückenfoto
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip>{item.category}</Chip>
        {item.colors.slice(0, 3).map((c) => (
          <span
            key={c.hex}
            className="rounded-full px-3 py-1.5 text-[12.5px]"
            style={{ background: c.hex, color: textOn(c.hex) }}
          >
            {colorName(c.hex)}
          </span>
        ))}
        {item.pattern !== 'Uni' && <Chip>{item.pattern}</Chip>}
        {item.styles.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
        {item.seasons.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-ink-850 p-4 text-[13px]">
        <div>
          <div className="text-white/35">Getragen</div>
          <div className="mt-0.5 text-[15px] font-semibold">{item.wearCount}×</div>
        </div>
        <div>
          <div className="text-white/35">Zuletzt</div>
          <div className="mt-0.5 text-[15px] font-semibold">
            {item.lastWorn ? new Date(item.lastWorn).toLocaleDateString('de-DE') : '–'}
          </div>
        </div>
        {item.brand && (
          <div className="col-span-2">
            <div className="text-white/35">Marke</div>
            <div className="mt-0.5">{item.brand}</div>
          </div>
        )}
        {item.notes && (
          <div className="col-span-2">
            <div className="text-white/35">Notiz</div>
            <div className="mt-0.5 leading-relaxed">{item.notes}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={onWear}>
          <Icon name="person" size={17} /> Anziehen
        </Button>
        <Button onClick={onEdit}>
          <Icon name="settings" size={16} /> Bearbeiten
        </Button>
        <Button variant="subtle" onClick={onMarkWorn}>
          <Icon name="check" size={16} /> Heute getragen
        </Button>
        <Button variant="subtle" onClick={onToggleFavorite}>
          <Icon name="star" size={16} /> {item.favorite ? 'Kein Liebling' : 'Liebling'}
        </Button>
      </div>

      {confirm ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4">
          <p className="text-[13px] text-rose-100/85">
            „{item.name}“ endgültig löschen? Das Bild wird mitgelöscht und aus allen Outfits
            entfernt.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="subtle" onClick={() => setConfirm(false)} className="flex-1">
              Behalten
            </Button>
            <Button variant="danger" onClick={onDelete} className="flex-1">
              <Icon name="trash" size={16} /> Löschen
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setConfirm(true)} className="w-full">
          <Icon name="trash" size={16} /> Teil löschen
        </Button>
      )}
    </div>
  )
}

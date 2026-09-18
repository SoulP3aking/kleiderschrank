import { useMemo, useState } from 'react'
import { ItemThumb } from '../components/ItemTile'
import { Button, Empty, Icon, Sheet, inputClass } from '../components/ui'
import { useImageUrl } from '../lib/imageUrls'
import { todayKey, useStore } from '../lib/store'
import type { Item, Outfit } from '../lib/types'

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** "YYYY-MM-DD" als lokales Datum – new Date("2026-09-18") wäre UTC und kann einen Tag verrutschen. */
const parseDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const keyOf = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function CalendarView({
  onWearOutfit,
  onToast,
}: {
  onWearOutfit: (ids: string[]) => void
  onToast: (t: string) => void
}) {
  const plan = useStore((s) => s.plan)
  const outfits = useStore((s) => s.outfits)
  const items = useStore((s) => s.items)
  const setPlan = useStore((s) => s.setPlan)
  const removePlan = useStore((s) => s.removePlan)
  const markWorn = useStore((s) => s.markWorn)

  const now = new Date()
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [openDate, setOpenDate] = useState<string | null>(null)

  const grid = useMemo(() => {
    const first = new Date(month.y, month.m, 1)
    const daysInMonth = new Date(month.y, month.m + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7 // Woche beginnt montags
    return { lead, daysInMonth }
  }, [month])

  const today = todayKey()
  const entry = openDate ? plan[openDate] : null
  const entryItems =
    entry?.itemIds.map((id) => items.find((i) => i.id === id)).filter((x): x is Item => !!x) ?? []

  const history = useMemo(
    () =>
      Object.values(plan)
        .filter((p) => p.worn)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 14),
    [plan],
  )

  const monthName = new Date(month.y, month.m, 1).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  })

  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1)
    setMonth({ y: d.getFullYear(), m: d.getMonth() })
  }

  return (
    <div className="pb-4">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => shift(-1)}>
          <Icon name="back" size={16} />
        </Button>
        <span className="text-[15px] font-semibold capitalize">{monthName}</span>
        <Button variant="ghost" size="sm" onClick={() => shift(1)}>
          <Icon name="next" size={16} />
        </Button>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] text-white/30">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: grid.lead }).map((_, i) => (
          <div key={`lead${i}`} />
        ))}
        {Array.from({ length: grid.daysInMonth }).map((_, i) => {
          const date = keyOf(month.y, month.m, i + 1)
          const p = plan[date]
          const isToday = date === today
          return (
            <button
              key={date}
              onClick={() => setOpenDate(date)}
              className={`relative aspect-[3/4] overflow-hidden rounded-xl border text-left transition-colors ${
                isToday ? 'border-sand-300' : p ? 'border-ink-600' : 'border-ink-800'
              } ${p ? 'bg-ink-850' : 'bg-ink-900/60'}`}
            >
              <span
                className={`absolute left-1.5 top-1 z-10 text-[11px] ${
                  isToday ? 'font-semibold text-sand-200' : 'text-white/40'
                }`}
              >
                {i + 1}
              </span>
              {p && <DayPreview entry={p} outfits={outfits} items={items} />}
              {p?.worn && (
                <span className="absolute bottom-1 right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-sand-300 text-ink-950">
                  <Icon name="check" size={10} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <h3 className="mb-2 mt-7 text-[13px] font-semibold text-white/55">Zuletzt getragen</h3>
      {history.length === 0 ? (
        <p className="rounded-2xl bg-ink-900 px-4 py-5 text-[12.5px] leading-relaxed text-white/35">
          Noch keine Einträge. Tippe auf einen Tag, um ein Outfit einzuplanen – und hake es ab,
          wenn du es wirklich angehabt hast.
        </p>
      ) : (
        <div className="space-y-1.5">
          {history.map((h) => {
            const its = h.itemIds
              .map((id) => items.find((i) => i.id === id))
              .filter((x): x is Item => !!x)
            return (
              <button
                key={h.date}
                onClick={() => setOpenDate(h.date)}
                className="flex w-full items-center gap-3 rounded-xl border border-ink-800 bg-ink-900 p-2 text-left"
              >
                <span className="w-[86px] shrink-0 text-[12px] text-white/45">
                  {parseDay(h.date).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: 'short',
                    weekday: 'short',
                  })}
                </span>
                <div className="flex gap-1 overflow-hidden">
                  {its.slice(0, 5).map((i) => (
                    <div
                      key={i.id}
                      className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-ink-700"
                    >
                      <ItemThumb item={i} className="h-full w-full" pad="p-0.5" />
                    </div>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Sheet
        open={!!openDate}
        onClose={() => setOpenDate(null)}
        title={
          openDate
            ? parseDay(openDate).toLocaleDateString('de-DE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : ''
        }
      >
        {openDate && (
          <div className="space-y-4 pb-2">
            {entry ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {entryItems.map((i) => (
                    <div key={i.id} className="overflow-hidden rounded-xl border border-ink-700">
                      <ItemThumb item={i} className="aspect-square w-full" pad="p-1.5" />
                    </div>
                  ))}
                </div>
                <input
                  className={inputClass}
                  placeholder="Notiz, z. B. Geburtstag Lisa"
                  value={entry.note}
                  onChange={(e) => setPlan({ ...entry, note: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="primary"
                    onClick={() => {
                      onWearOutfit(entry.itemIds)
                      setOpenDate(null)
                    }}
                  >
                    <Icon name="person" size={16} /> Anziehen
                  </Button>
                  <Button
                    variant={entry.worn ? 'subtle' : 'default'}
                    onClick={async () => {
                      const worn = !entry.worn
                      await setPlan({ ...entry, worn })
                      if (worn) await markWorn(entry.itemIds, parseDay(entry.date).getTime())
                      onToast(worn ? 'Abgehakt' : 'Haken entfernt')
                    }}
                  >
                    <Icon name="check" size={16} /> {entry.worn ? 'Doch nicht' : 'Getragen'}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={async () => {
                    await removePlan(openDate)
                    onToast('Eintrag entfernt')
                  }}
                >
                  <Icon name="trash" size={16} /> Eintrag löschen
                </Button>
              </>
            ) : outfits.length === 0 ? (
              <Empty
                title="Keine Outfits vorhanden"
                text="Speichere zuerst im Ankleidezimmer ein Outfit, dann kannst du es hier auf Tage verteilen."
              />
            ) : (
              <>
                <p className="text-[13px] text-white/45">Welches Outfit trägst du an dem Tag?</p>
                <div className="grid grid-cols-3 gap-2">
                  {outfits.map((o) => (
                    <button
                      key={o.id}
                      onClick={async () => {
                        await setPlan({
                          date: openDate,
                          outfitId: o.id,
                          itemIds: o.itemIds,
                          worn: false,
                          note: '',
                        })
                        onToast('Eingeplant')
                      }}
                      className="overflow-hidden rounded-xl border border-ink-700 text-left"
                    >
                      <OutfitCover outfit={o} />
                      <div className="truncate bg-ink-850 px-2 py-1.5 text-[11.5px] text-white/75">
                        {o.name}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}

function OutfitCover({ outfit }: { outfit: Outfit }) {
  const url = useImageUrl(outfit.cover)
  return (
    <div className="flex aspect-[3/4] items-center justify-center bg-ink-900">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : (
        <Icon name="person" size={20} className="text-white/20" />
      )}
    </div>
  )
}

function DayPreview({
  entry,
  outfits,
  items,
}: {
  entry: { outfitId: string | null; itemIds: string[] }
  outfits: Outfit[]
  items: Item[]
}) {
  const outfit = entry.outfitId ? outfits.find((o) => o.id === entry.outfitId) : null
  const url = useImageUrl(outfit?.cover ?? null)
  if (url) return <img src={url} alt="" className="h-full w-full object-contain opacity-90" />
  const first = items.find((i) => i.id === entry.itemIds[0])
  if (!first) return null
  return <ItemThumb item={first} className="h-full w-full" pad="p-1" />
}

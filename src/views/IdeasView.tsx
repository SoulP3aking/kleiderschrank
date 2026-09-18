import { useMemo, useState } from 'react'
import { FigureStage } from '../components/FigureStage'
import { ItemThumb } from '../components/ItemTile'
import { Button, Chip, Empty, Icon, Sheet } from '../components/ui'
import { useImageUrl } from '../lib/imageUrls'
import { todayKey, useStore } from '../lib/store'
import { missingForSuggestions, suggestOutfits, type Suggestion } from '../lib/suggest'
import { SEASONS, STYLES, type Item, type Outfit, type Season, type Style } from '../lib/types'

export function IdeasView({
  onWearOutfit,
  onToast,
}: {
  onWearOutfit: (ids: string[]) => void
  onToast: (t: string) => void
}) {
  const items = useStore((s) => s.items)
  const outfits = useStore((s) => s.outfits)
  const [tab, setTab] = useState<'vorschlaege' | 'gespeichert'>('vorschlaege')

  return (
    <div className="pb-4">
      <div className="mb-3 flex gap-1 rounded-full bg-ink-850 p-1">
        {(
          [
            ['vorschlaege', `Vorschläge`],
            ['gespeichert', `Meine Outfits ${outfits.length ? `(${outfits.length})` : ''}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-full px-3 py-2 text-[13px] transition-colors ${
              tab === id ? 'bg-ink-700 text-white font-medium' : 'text-white/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'vorschlaege' ? (
        <Suggestions items={items} onWearOutfit={onWearOutfit} onToast={onToast} />
      ) : (
        <SavedOutfits onWearOutfit={onWearOutfit} onToast={onToast} />
      )}
    </div>
  )
}

function Suggestions({
  items,
  onWearOutfit,
  onToast,
}: {
  items: Item[]
  onWearOutfit: (ids: string[]) => void
  onToast: (t: string) => void
}) {
  const settings = useStore((s) => s.settings)
  const [season, setSeason] = useState<Season | null>(null)
  const [style, setStyle] = useState<Style | null>(null)
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [seed, setSeed] = useState(1)
  const [pickAnchor, setPickAnchor] = useState(false)

  const missing = missingForSuggestions(items)
  const suggestions = useMemo(
    () =>
      missing.length
        ? []
        : suggestOutfits(items, { season, style, anchorId, seed, limit: 12 }),
    [items, season, style, anchorId, seed, missing.length],
  )
  const anchor = items.find((i) => i.id === anchorId) ?? null

  if (missing.length) {
    return (
      <Empty
        title="Fast geschafft"
        text={`Für sinnvolle Vorschläge fehlt noch ${missing.join(' und ')}. Sobald der Schrank voller ist, kombiniert die App automatisch nach Farbharmonie.`}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1">
        <Chip active={!season && !style} onClick={() => { setSeason(null); setStyle(null) }}>
          Alles
        </Chip>
        {SEASONS.map((s) => (
          <Chip key={s} active={season === s} onClick={() => setSeason(season === s ? null : s)}>
            {s}
          </Chip>
        ))}
        {STYLES.map((s) => (
          <Chip key={s} active={style === s} onClick={() => setStyle(style === s ? null : s)}>
            {s}
          </Chip>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="subtle" size="sm" className="flex-1" onClick={() => setPickAnchor(true)}>
          <Icon name="hanger" size={15} />
          {anchor ? `Rund um: ${anchor.name}` : 'Von einem Teil ausgehen'}
        </Button>
        {anchor && (
          <Button variant="ghost" size="sm" onClick={() => setAnchorId(null)}>
            <Icon name="x" size={15} />
          </Button>
        )}
        <Button variant="subtle" size="sm" onClick={() => setSeed((s) => s + 1)}>
          <Icon name="shuffle" size={15} /> Neu
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <Empty
          title="Keine Kombination gefunden"
          text="Mit diesen Filtern passt gerade nichts zusammen. Nimm einen Filter raus oder würfle neu."
        />
      ) : (
        <div className="space-y-2.5">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              items={items}
              figure={settings.figure}
              onWear={() => {
                onWearOutfit(s.itemIds)
                onToast('Outfit angezogen – jetzt im Ankleidezimmer')
              }}
            />
          ))}
        </div>
      )}

      <Sheet open={pickAnchor} onClose={() => setPickAnchor(false)} title="Welches Teil soll rein?">
        <div className="grid grid-cols-4 gap-2 pb-2">
          {items.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                setAnchorId(i.id)
                setPickAnchor(false)
              }}
              className={`overflow-hidden rounded-xl border ${
                anchorId === i.id ? 'border-sand-300' : 'border-ink-700'
              }`}
            >
              <ItemThumb item={i} className="aspect-square w-full" pad="p-1.5" />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function SuggestionCard({
  suggestion,
  items,
  figure,
  onWear,
}: {
  suggestion: Suggestion
  items: Item[]
  figure: ReturnType<typeof useStore.getState>['settings']['figure']
  onWear: () => void
}) {
  const outfitItems = suggestion.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((x): x is Item => !!x)
  // Weiche Skala: sehr gute Kombis landen bei 85–99 %, keine Kombi ist "perfekt".
  const percent = Math.min(99, Math.round(100 / (1 + Math.exp(-(suggestion.score - 0.62) * 7))))

  return (
    <div className="flex gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-3">
      <div className="w-[86px] shrink-0 overflow-hidden rounded-xl bg-ink-850">
        <FigureStage items={outfitItems} view="front" figure={figure} className="!max-w-none" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1">
            {outfitItems.slice(0, 5).map((i) => (
              <span
                key={i.id}
                className="h-4 w-4 rounded-full border border-ink-900"
                style={{ background: i.colors[0]?.hex ?? '#666' }}
              />
            ))}
          </div>
          <span className="ml-auto text-[11.5px] text-white/35">{percent} % Match</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestion.reasons.map((r) => (
            <span
              key={r}
              className="rounded-full bg-sand-300/12 px-2 py-0.5 text-[11px] text-sand-200"
            >
              {r}
            </span>
          ))}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-white/50">
          {outfitItems.map((i) => i.name).join(' · ')}
        </p>
        <div className="mt-auto flex gap-2 pt-2">
          <Button size="sm" variant="primary" onClick={onWear} className="flex-1">
            <Icon name="person" size={14} /> Anprobieren
          </Button>
        </div>
      </div>
    </div>
  )
}

function SavedOutfits({
  onWearOutfit,
  onToast,
}: {
  onWearOutfit: (ids: string[]) => void
  onToast: (t: string) => void
}) {
  const outfits = useStore((s) => s.outfits)
  const items = useStore((s) => s.items)
  const removeOutfit = useStore((s) => s.removeOutfit)
  const markWorn = useStore((s) => s.markWorn)
  const setPlan = useStore((s) => s.setPlan)
  const plan = useStore((s) => s.plan)
  const [open, setOpen] = useState<Outfit | null>(null)

  if (!outfits.length) {
    return (
      <Empty
        title="Noch keine Outfits gespeichert"
        text="Stell im Ankleidezimmer eine Kombination zusammen und speichere sie – hier findest du sie dann wieder."
      />
    )
  }

  const current = open ? outfits.find((o) => o.id === open.id) ?? null : null
  const currentItems =
    current?.itemIds.map((id) => items.find((i) => i.id === id)).filter((x): x is Item => !!x) ?? []

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {outfits.map((o) => (
          <OutfitCard key={o.id} outfit={o} onClick={() => setOpen(o)} />
        ))}
      </div>

      <Sheet open={!!current} onClose={() => setOpen(null)} title={current?.name}>
        {current && (
          <div className="space-y-4 pb-2">
            <div className="grid grid-cols-4 gap-2">
              {currentItems.map((i) => (
                <div key={i.id} className="overflow-hidden rounded-xl border border-ink-700">
                  <ItemThumb item={i} className="aspect-square w-full" pad="p-1.5" />
                </div>
              ))}
            </div>
            <p className="text-[12.5px] text-white/45">
              {currentItems.map((i) => i.name).join(' · ')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  onWearOutfit(current.itemIds)
                  setOpen(null)
                }}
              >
                <Icon name="person" size={16} /> Anziehen
              </Button>
              <Button
                variant="subtle"
                onClick={async () => {
                  await markWorn(current.itemIds)
                  onToast('Als heute getragen vermerkt')
                }}
              >
                <Icon name="check" size={16} /> Heute getragen
              </Button>
              <Button
                variant="subtle"
                onClick={async () => {
                  const date = todayKey()
                  await setPlan({
                    date,
                    outfitId: current.id,
                    itemIds: current.itemIds,
                    worn: plan[date]?.worn ?? false,
                    note: plan[date]?.note ?? '',
                  })
                  onToast('Für heute eingeplant')
                }}
              >
                <Icon name="calendar" size={16} /> Für heute planen
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await removeOutfit(current.id)
                  setOpen(null)
                  onToast('Outfit gelöscht')
                }}
              >
                <Icon name="trash" size={16} /> Löschen
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}

export function OutfitCard({ outfit, onClick }: { outfit: Outfit; onClick?: () => void }) {
  const url = useImageUrl(outfit.cover)
  return (
    <button
      onClick={onClick}
      className="overflow-hidden rounded-2xl border border-ink-700 text-left transition-colors hover:border-ink-600"
    >
      <div className="flex aspect-[3/4] items-center justify-center bg-gradient-to-b from-ink-850 to-ink-900">
        {url ? (
          <img src={url} alt={outfit.name} className="h-full w-full object-contain" />
        ) : (
          <Icon name="person" size={26} className="text-white/20" />
        )}
      </div>
      <div className="truncate bg-ink-850 px-2.5 py-2 text-[12.5px] text-white/80">
        {outfit.name}
      </div>
    </button>
  )
}

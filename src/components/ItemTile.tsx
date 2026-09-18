import { useImageUrl } from '../lib/imageUrls'
import type { Item } from '../lib/types'
import { Icon } from './ui'

export function ItemThumb({
  item,
  className = '',
  pad = 'p-2',
}: {
  item: Item
  className?: string
  pad?: string
}) {
  const url = useImageUrl(item.thumb ?? item.imageFront)
  return (
    <div className={`checker relative overflow-hidden ${className}`}>
      {url ? (
        <img src={url} alt={item.name} className={`h-full w-full object-contain ${pad}`} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-white/20">
          <Icon name="hanger" size={22} />
        </div>
      )}
    </div>
  )
}

export function ItemTile({
  item,
  onClick,
  selected,
  badge,
}: {
  item: Item
  onClick?: () => void
  selected?: boolean
  badge?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border text-left transition-colors ${
        selected ? 'border-sand-300 ring-1 ring-sand-300/40' : 'border-ink-700 hover:border-ink-600'
      }`}
    >
      <ItemThumb item={item} className="aspect-square w-full" />
      <div className="flex items-center gap-1.5 bg-ink-850 px-2.5 py-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
          style={{ background: item.colors[0]?.hex ?? '#666' }}
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/80">{item.name}</span>
        {item.favorite && <Icon name="star" size={13} className="shrink-0 text-sand-300" />}
      </div>
      {badge && (
        <span className="absolute left-2 top-2 rounded-full bg-ink-950/80 px-2 py-0.5 text-[10.5px] text-white/70">
          {badge}
        </span>
      )}
      {selected && (
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-sand-300 text-ink-950">
          <Icon name="check" size={14} />
        </span>
      )}
    </button>
  )
}

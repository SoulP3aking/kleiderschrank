import { useCallback, useEffect, useRef, useState } from 'react'
import { ItemEditor } from './components/ItemEditor'
import { Button, Icon, Sheet, Toast } from './components/ui'
import { useStore } from './lib/store'
import type { Item } from './lib/types'
import { CalendarView } from './views/CalendarView'
import { IdeasView } from './views/IdeasView'
import { SettingsView } from './views/SettingsView'
import { StudioView } from './views/StudioView'
import { WardrobeView } from './views/WardrobeView'

type Tab = 'schrank' | 'ideen' | 'studio' | 'kalender' | 'mehr'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'schrank', label: 'Schrank', icon: 'grid' },
  { id: 'ideen', label: 'Ideen', icon: 'sparkles' },
  { id: 'studio', label: 'Ankleiden', icon: 'person' },
  { id: 'kalender', label: 'Kalender', icon: 'calendar' },
  { id: 'mehr', label: 'Mehr', icon: 'settings' },
]

const TITLES: Record<Tab, string> = {
  schrank: 'Kleiderschrank',
  ideen: 'Outfit-Ideen',
  studio: 'Ankleidezimmer',
  kalender: 'Kalender',
  mehr: 'Einstellungen',
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const load = useStore((s) => s.load)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const [tab, setTab] = useState<Tab>('schrank')
  const [worn, setWorn] = useState<string[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const showToast = useCallback((text: string) => {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const dress = useCallback((ids: string[]) => {
    setWorn(ids)
    setTab('studio')
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-sand-300" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(var(--safe-t)+0.75rem)]">
        <h1 className="text-[19px] font-semibold tracking-tight">{TITLES[tab]}</h1>
        {tab !== 'mehr' && (
          <button
            onClick={() => setTab('mehr')}
            className="rounded-full p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Einstellungen"
          >
            <Icon name="settings" size={19} />
          </button>
        )}
      </header>

      <main
        className={`min-h-0 flex-1 px-4 ${tab === 'studio' ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {tab === 'schrank' && (
          <WardrobeView
            onEdit={(item) => {
              setEditItem(item)
              setEditorOpen(true)
            }}
            onWear={(item) => dress([item.id])}
            onToast={showToast}
          />
        )}
        {tab === 'ideen' && <IdeasView onWearOutfit={dress} onToast={showToast} />}
        {tab === 'studio' && (
          <StudioView
            worn={worn}
            setWorn={setWorn}
            onToast={showToast}
            onOpenSettings={() => setTab('mehr')}
          />
        )}
        {tab === 'kalender' && <CalendarView onWearOutfit={dress} onToast={showToast} />}
        {tab === 'mehr' && <SettingsView onToast={showToast} />}
      </main>

      <nav className="shrink-0 border-t border-ink-800 bg-ink-900/95 px-2 pb-[calc(var(--safe-b)+0.35rem)] pt-1.5 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center">
          {TABS.slice(0, 2).map((t) => (
            <TabButton key={t.id} tab={t} active={tab === t.id} onClick={() => setTab(t.id)} />
          ))}
          <div className="flex flex-1 justify-center">
            <button
              onClick={() => {
                setEditItem(null)
                setEditorOpen(true)
              }}
              className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-sand-300 text-ink-950 shadow-lg shadow-black/40 transition-transform active:scale-95"
              aria-label="Kleidungsstück hinzufügen"
            >
              <Icon name="camera" size={24} />
            </button>
          </div>
          {TABS.slice(2, 4).map((t) => (
            <TabButton key={t.id} tab={t} active={tab === t.id} onClick={() => setTab(t.id)} />
          ))}
        </div>
      </nav>

      <ItemEditor
        open={editorOpen}
        edit={editItem}
        onClose={() => {
          setEditorOpen(false)
          setEditItem(null)
        }}
        onSaved={() => showToast(editItem ? 'Gespeichert' : 'Teil im Schrank')}
      />

      <Sheet
        open={!settings.onboarded}
        onClose={() => updateSettings({ onboarded: true })}
        title="Willkommen in deinem Kleiderschrank"
        footer={
          <Button
            variant="primary"
            className="w-full"
            onClick={() => updateSettings({ onboarded: true })}
          >
            Los geht’s
          </Button>
        }
      >
        <div className="space-y-4 pb-2 text-[13.5px] leading-relaxed text-white/65">
          <Step icon="camera" title="Fotografieren">
            Kleidungsstück flach hinlegen, abfotografieren – der Hintergrund wird automatisch
            entfernt und die Kategorie erkannt. Beides passiert auf deinem Gerät.
          </Step>
          <Step icon="person" title="Ankleiden">
            Im Ankleidezimmer ziehst du die Teile einer Figur an, verschiebst und skalierst sie mit
            dem Finger – vorne und hinten – und speicherst das Outfit.
          </Step>
          <Step icon="sparkles" title="Vorschläge">
            Unter „Ideen“ kombiniert die App deine Teile automatisch nach Farbharmonie, Muster und
            Anlass.
          </Step>
          <Step icon="download" title="Bitte Backups machen">
            Alles bleibt in diesem Browser – ohne Konto und ohne Server. Lade dir unter „Mehr“
            regelmäßig ein Backup herunter, sonst ist bei gelöschten Browserdaten alles weg.
          </Step>
        </div>
      </Sheet>

      <Toast text={toast} />
    </div>
  )
}

function Step({
  icon,
  title,
  children,
}: {
  icon: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-sand-300">
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div className="font-semibold text-white">{title}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  )
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: { id: Tab; label: string; icon: string }
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] transition-colors ${
        active ? 'text-sand-200' : 'text-white/40'
      }`}
    >
      <Icon name={tab.icon} size={21} />
      {tab.label}
    </button>
  )
}

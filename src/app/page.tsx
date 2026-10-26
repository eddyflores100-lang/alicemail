'use client'

// AliceMail v2 — Aplicación con menú lateral
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  Flame,
  Mailbox,
  Users,
  Megaphone,
  Inbox as InboxIcon,
  Settings2,
  Activity,
  Bot,
  Bell,
  Plug,
  LayoutDashboard,
  Menu,
  Send,
  Workflow,
} from 'lucide-react'
import { Dashboard } from '@/components/alice/dashboard'
import { Mailboxes } from '@/components/alice/mailboxes'
import { Leads } from '@/components/alice/leads'
import { Campaigns } from '@/components/alice/campaigns'
import { Inbox } from '@/components/alice/inbox'
import { SettingsPanel } from '@/components/alice/settings-panel'
import { Agent } from '@/components/alice/agent'
import { Notifications } from '@/components/alice/notifications'
import { McpPanel } from '@/components/alice/mcp-panel'
import { Automation } from '@/components/alice/automation'
import { api, InboxDTO, StatsDTO } from '@/components/alice/types'

type Section = 'panel' | 'buzones' | 'campanas' | 'leads' | 'bandeja' | 'agente' | 'auto' | 'notificaciones' | 'mcp' | 'ajustes'

const NAV_GROUPS: { label: string; items: { id: Section; label: string; icon: React.ReactNode; badge?: 'unread' | 'pending' }[] }[] = [
  {
    label: 'Operación',
    items: [
      { id: 'panel', label: 'Panel', icon: <LayoutDashboard className="h-4 w-4" /> },
      { id: 'buzones', label: 'Buzones', icon: <Mailbox className="h-4 w-4" /> },
      { id: 'campanas', label: 'Campañas', icon: <Megaphone className="h-4 w-4" /> },
      { id: 'leads', label: 'CRM · Leads', icon: <Users className="h-4 w-4" /> },
      { id: 'bandeja', label: 'Bandeja', icon: <InboxIcon className="h-4 w-4" />, badge: 'unread' },
    ],
  },
  {
    label: 'Inteligencia',
    items: [
      { id: 'agente', label: 'Agente IA', icon: <Bot className="h-4 w-4" />, badge: 'pending' },
      { id: 'auto', label: 'Automatización', icon: <Workflow className="h-4 w-4" /> },
      { id: 'notificaciones', label: 'Notificaciones', icon: <Bell className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'mcp', label: 'MCP', icon: <Plug className="h-4 w-4" /> },
      { id: 'ajustes', label: 'Ajustes', icon: <Settings2 className="h-4 w-4" /> },
    ],
  },
]

const SECTION_TITLE: Record<Section, string> = {
  panel: 'Panel',
  buzones: 'Buzones',
  campanas: 'Campañas',
  leads: 'CRM · Leads',
  bandeja: 'Bandeja unificada',
  agente: 'Agente IA',
  auto: 'Automatización CRM',
  notificaciones: 'Notificaciones',
  mcp: 'MCP — Control externo',
  ajustes: 'Ajustes',
}

export default function Home() {
  const [section, setSection] = useState<Section>('panel')
  const [refreshKey, setRefreshKey] = useState(0)
  const [unread, setUnread] = useState(0)
  const [pending, setPending] = useState(0)
  const [quota, setQuota] = useState<{ sent: number; cap: number } | null>(null)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    const load = () => {
      api<InboxDTO>('/api/inbox?unread=1')
        .then((d) => {
          setUnread(d.unreadCount)
          setPending(d.unclassifiedCount)
        })
        .catch(() => {})
      api<StatsDTO>('/api/stats')
        .then((s) => setQuota({ sent: s.quota.campaignSentToday, cap: s.quota.campaignCap }))
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [refreshKey])

  const refresh = () => setRefreshKey((k) => k + 1)
  const go = (s: Section) => {
    setSection(s)
    setNavOpen(false)
    refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Menú lateral escritorio */}
      <SidebarNav section={section} unread={unread} pending={pending} onGo={go} />

      {/* Columna derecha */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" aria-describedby={undefined} className="w-72 p-0 bg-slate-900 border-slate-800">
              <SheetHeader className="px-4 pt-4 pb-0">
                <SheetTitle className="text-left text-white">
                  <Brand />
                </SheetTitle>
              </SheetHeader>
              <SidebarNav section={section} unread={unread} pending={pending} onGo={go} inSheet />
            </SheetContent>
          </Sheet>

          <h2 className="text-sm font-semibold text-slate-800 truncate">{SECTION_TITLE[section]}</h2>

          <div className="ml-auto flex items-center gap-2">
            {quota && (
              <Badge variant="outline" className="gap-1.5 border-slate-200 text-slate-600 font-medium hidden sm:flex">
                <Send className="h-3 w-3 text-emerald-600" />
                hoy {quota.sent}/{quota.cap}
              </Badge>
            )}
            <Badge variant="outline" className={`gap-1.5 font-medium ${unread > 0 ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>
              <InboxIcon className="h-3 w-3" />
              {unread}
            </Badge>
            <span className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              motor 45s · agente 90s
            </span>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto max-w-6xl pb-6">
            {section === 'panel' && <Dashboard refreshKey={refreshKey} />}
            {section === 'buzones' && <Mailboxes refreshKey={refreshKey} onChanged={refresh} />}
            {section === 'campanas' && <Campaigns refreshKey={refreshKey} onChanged={refresh} />}
            {section === 'leads' && <Leads refreshKey={refreshKey} onChanged={refresh} />}
            {section === 'bandeja' && <Inbox refreshKey={refreshKey} onChanged={refresh} />}
            {section === 'agente' && <Agent refreshKey={refreshKey} onChanged={refresh} onGoInbox={() => go('bandeja')} />}
            {section === 'auto' && <Automation refreshKey={refreshKey} />}
            {section === 'notificaciones' && <Notifications refreshKey={refreshKey} />}
            {section === 'mcp' && <McpPanel refreshKey={refreshKey} />}
            {section === 'ajustes' && <SettingsPanel refreshKey={refreshKey} />}
          </div>
        </main>

        {/* Pie pegado abajo */}
        <footer className="shrink-0 border-t bg-white px-4 py-2.5">
          <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              AliceMail v3.0 — CRM de leads · agente IA · re-engagement automático · MCP · software propio en tu VM de Oracle Cloud
            </span>
            <span>Uso responsable: respeta CAN-SPAM / GDPR, incluye baja en cada correo</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/40">
        <Flame className="h-4.5 w-4.5 text-emerald-400" />
      </div>
      <div className="leading-tight">
        <p className="text-base font-bold text-white">
          Alice<span className="text-emerald-400">Mail</span>
        </p>
        <p className="text-[10px] text-slate-400">Cold email · TechDigital · AliceLabs</p>
      </div>
    </div>
  )
}

function SidebarNav({
  section,
  unread,
  pending,
  onGo,
  inSheet = false,
}: {
  section: Section
  unread: number
  pending: number
  onGo: (s: Section) => void
  inSheet?: boolean
}) {
  const badgeFor = (id: Section): number | null => {
    if (id === 'bandeja' && unread > 0) return unread
    if (id === 'agente' && pending > 0) return pending
    return null
  }
  return (
    <nav className={`${inSheet ? 'flex-1 overflow-y-auto pt-2' : 'hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col'} bg-slate-900`}>
      {!inSheet && (
        <div className="px-4 py-4">
          <Brand />
        </div>
      )}
      <div className="flex-1 space-y-5 px-3 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = section === item.id
                const badge = badgeFor(item.id)
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onGo(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-emerald-500/15 font-semibold text-emerald-300 ring-1 ring-emerald-400/30'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span className={active ? 'text-emerald-400' : 'text-slate-400'}>{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {badge !== null && (
                        <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                          {badge}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 text-[10px] text-slate-500 border-t border-slate-800">
        <p>v3.0 · crm · agente · telegram/whatsapp · mcp</p>
      </div>
    </nav>
  )
}

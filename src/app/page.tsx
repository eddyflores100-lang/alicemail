'use client'

// AliceMail v4 — Shell de aplicación profesional (estilo CRM de referencia)
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  Mailbox,
  Users,
  Megaphone,
  Inbox as InboxIcon,
  Settings2,
  Activity,
  Bell,
  Plug,
  LayoutDashboard,
  Menu,
  Send,
  Workflow,
  Sparkles,
  Globe,
  LogOut,
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
import { Connection } from '@/components/alice/connection'
import { LoginScreen, Brand } from '@/components/alice/login'
import { api, InboxDTO, StatsDTO } from '@/components/alice/types'
import { toast } from 'sonner'

type Section =
  | 'panel' | 'buzones' | 'campanas' | 'leads' | 'bandeja'
  | 'agente' | 'auto' | 'notificaciones' | 'mcp' | 'conexion' | 'ajustes'

const NAV_GROUPS: { label: string; items: { id: Section; label: string; icon: React.ReactNode; badge?: 'unread' | 'pending' }[] }[] = [
  {
    label: 'CRM',
    items: [
      { id: 'panel', label: 'Resumen', icon: <LayoutDashboard className="h-4 w-4" /> },
      { id: 'leads', label: 'Contactos', icon: <Users className="h-4 w-4" /> },
      { id: 'bandeja', label: 'Bandeja de entrada', icon: <InboxIcon className="h-4 w-4" />, badge: 'unread' },
    ],
  },
  {
    label: 'Correo',
    items: [
      { id: 'campanas', label: 'Campañas', icon: <Megaphone className="h-4 w-4" /> },
      { id: 'buzones', label: 'Buzones de envío', icon: <Mailbox className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Automatización',
    items: [
      { id: 'auto', label: 'Flujos de trabajo', icon: <Workflow className="h-4 w-4" /> },
      { id: 'agente', label: 'Asistente', icon: <Sparkles className="h-4 w-4" />, badge: 'pending' },
    ],
  },
  {
    label: 'Integraciones',
    items: [
      { id: 'notificaciones', label: 'Notificaciones', icon: <Bell className="h-4 w-4" /> },
      { id: 'mcp', label: 'MCP', icon: <Plug className="h-4 w-4" /> },
    ],
  },
  {
    label: 'Administración',
    items: [
      { id: 'conexion', label: 'Conexión', icon: <Globe className="h-4 w-4" /> },
      { id: 'ajustes', label: 'Configuración', icon: <Settings2 className="h-4 w-4" /> },
    ],
  },
]

const SECTION_TITLE: Record<Section, { title: string; desc: string }> = {
  panel: { title: 'Resumen', desc: 'Actividad, cuota diaria y salud del sistema' },
  buzones: { title: 'Buzones de envío', desc: 'Cuentas conectadas, warmup y límites' },
  campanas: { title: 'Campañas', desc: 'Secuencias y promociones activas' },
  leads: { title: 'Contactos', desc: 'Pipeline comercial con catalogación automática' },
  bandeja: { title: 'Bandeja de entrada', desc: 'Respuestas clasificadas por el asistente' },
  agente: { title: 'Asistente', desc: 'Clasificación, borradores y guardianes automáticos' },
  auto: { title: 'Flujos de trabajo', desc: 'Reglas de re-engagement y enfoques' },
  notificaciones: { title: 'Notificaciones', desc: 'Avisos a Telegram y WhatsApp' },
  mcp: { title: 'MCP', desc: 'Control externo seguro para agentes y clientes' },
  conexion: { title: 'Conexión', desc: 'Dominio alicelabs.space, DNS y túnel seguro' },
  ajustes: { title: 'Configuración', desc: 'Motor de envío, ventanas y seguridad' },
}

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [hasPassword, setHasPassword] = useState(true)
  const [section, setSection] = useState<Section>('panel')
  const [refreshKey, setRefreshKey] = useState(0)
  const [unread, setUnread] = useState(0)
  const [pending, setPending] = useState(0)
  const [quota, setQuota] = useState<{ sent: number; cap: number } | null>(null)
  const [navOpen, setNavOpen] = useState(false)

  const checkAuth = useCallback(() => {
    api<{ authenticated: boolean; hasPassword: boolean }>('/api/auth/session')
      .then((s) => {
        setAuthed(s.authenticated)
        setHasPassword(s.hasPassword)
      })
      .catch(() => setAuthed(false))
  }, [])

  useEffect(checkAuth, [checkAuth])

  useEffect(() => {
    if (!authed) return
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
  }, [authed, refreshKey])

  const refresh = () => setRefreshKey((k) => k + 1)
  const go = (s: Section) => {
    setSection(s)
    setNavOpen(false)
    refresh()
  }
  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
      setAuthed(false)
    } catch {
      toast.error('No se pudo cerrar la sesión')
    }
  }

  if (authed === null) {
    return <div className="flex min-h-screen items-center justify-center bg-background" aria-busy="true" />
  }
  if (!authed) {
    return <LoginScreen hasPassword={hasPassword} onAuth={checkAuth} />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Menú lateral escritorio */}
      <SidebarNav section={section} unread={unread} pending={pending} onGo={go} onLogout={logout} />

      {/* Columna derecha */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" aria-describedby={undefined} className="w-64 p-0 bg-card border-r">
              <SheetHeader className="px-4 pt-4 pb-0">
                <SheetTitle className="text-left text-foreground">
                  <Brand />
                </SheetTitle>
              </SheetHeader>
              <SidebarNav section={section} unread={unread} pending={pending} onGo={go} onLogout={logout} inSheet />
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-foreground truncate leading-tight">{SECTION_TITLE[section].title}</h2>
            <p className="hidden sm:block text-[11px] text-muted-foreground truncate leading-tight">{SECTION_TITLE[section].desc}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {quota && (
              <Badge variant="outline" className="gap-1.5 text-muted-foreground font-medium hidden sm:flex">
                <Send className="h-3 w-3 text-primary" />
                {quota.sent}/{quota.cap} hoy
              </Badge>
            )}
            <Badge variant="outline" className={`gap-1.5 font-medium ${unread > 0 ? 'border-primary/40 text-primary' : 'text-muted-foreground/60'}`}>
              <InboxIcon className="h-3 w-3" />
              {unread}
            </Badge>
            <span className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-chart-2" />
              motor 45s · asistente 90s
            </span>
            <Button variant="ghost" size="sm" onClick={logout} className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Salir</span>
            </Button>
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
            {section === 'conexion' && <Connection refreshKey={refreshKey} />}
            {section === 'ajustes' && <SettingsPanel refreshKey={refreshKey} />}
          </div>
        </main>

        {/* Pie pegado abajo */}
        <footer className="shrink-0 border-t bg-card px-4 py-2">
          <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>AliceMail v4.0 · CRM de correo en frío · cifrado AES-256 · alicelabs.space</span>
            <span>Uso responsable: respeta CAN-SPAM / GDPR e incluye la baja en cada correo</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

function SidebarNav({
  section,
  unread,
  pending,
  onGo,
  onLogout,
  inSheet = false,
}: {
  section: Section
  unread: number
  pending: number
  onGo: (s: Section) => void
  onLogout: () => void
  inSheet?: boolean
}) {
  const badgeFor = (id: Section): number | null => {
    if (id === 'bandeja' && unread > 0) return unread
    if (id === 'agente' && pending > 0) return pending
    return null
  }
  return (
    <nav className={`${inSheet ? 'flex-1 overflow-y-auto pt-2' : 'hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col'} bg-card border-r border-sidebar-border`}>
      {!inSheet && (
        <div className="px-4 py-4">
          <Brand />
        </div>
      )}
      <div className="flex-1 space-y-4 px-3 py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = section === item.id
                const badge = badgeFor(item.id)
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onGo(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        active
                          ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <span className={active ? 'text-primary' : 'text-muted-foreground/70'}>{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                      {badge !== null && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground tabular-nums">
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
      <div className="px-4 py-3 text-[10px] text-muted-foreground/70 border-t border-sidebar-border">
        <p>v4.0 · cifrado AES-256-GCM · alicelabs.space</p>
        <button onClick={onLogout} className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
          <LogOut className="h-3 w-3" /> Cerrar sesión
        </button>
      </div>
    </nav>
  )
}

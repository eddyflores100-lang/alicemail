'use client'

// Página Agente IA: control de autonomía, borradores, decisiones y guardianes
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Bot,
  Loader2,
  Play,
  Flame,
  PenLine,
  Eye,
  Send,
  Sparkles,
  Clock,
  RefreshCw,
  Inbox as InboxIcon,
} from 'lucide-react'
import {
  api,
  AgentDTO,
  AgentEventDTO,
  InboxDTO,
  TEMP_LABEL,
  TEMP_BADGE,
  EVENT_LEVEL_STYLE,
  EVENT_TYPE_LABEL,
} from './types'
import { toast } from 'sonner'

const AUTONOMY: Record<string, { label: string; desc: string }> = {
  OBSERVE: { label: 'Observar', desc: 'Clasifica y registra, no notifica ni responde' },
  ASSIST: { label: 'Asistir', desc: 'Clasifica, te notifica y deja borradores para aprobar' },
  AUTO: { label: 'Autónomo', desc: 'Clasifica, notifica y responde solo a los leads calientes' },
}

export function Agent({ refreshKey, onChanged, onGoInbox }: { refreshKey: number; onChanged: () => void; onGoInbox: () => void }) {
  const [data, setData] = useState<AgentDTO | null>(null)
  const [events, setEvents] = useState<AgentEventDTO[]>([])
  const [drafts, setDrafts] = useState<InboxDTO['messages']>([])
  const [editedDraft, setEditedDraft] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)

  const load = useCallback(() => {
    api<AgentDTO>('/api/agent').then(setData).catch((e) => toast.error(e.message))
    api<{ events: AgentEventDTO[] }>('/api/agent/events?limit=50').then((d) => setEvents(d.events)).catch(() => {})
    api<InboxDTO>('/api/inbox?filter=drafts').then((d) => setDrafts(d.messages)).catch(() => {})
  }, [])

  useEffect(load, [load, refreshKey])

  const patchSettings = async (patch: Partial<AgentDTO['settings']>) => {
    try {
      await api('/api/agent', { method: 'PATCH', body: JSON.stringify(patch) })
      load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const r = await api<{ classified: number; hot: number; autoReplies: number; guards: number; reportSent: boolean }>('/api/agent/run', { method: 'POST' })
      toast.success(`Ciclo completado: ${r.classified} clasificados · ${r.hot} calientes · ${r.autoReplies} respuestas · ${r.guards} alertas`)
      load()
      onChanged()
    } catch {
      toast.error('El ciclo del agente falló')
    } finally {
      setRunning(false)
    }
  }

  const saveCfg = async () => {
    if (!data) return
    setSavingCfg(true)
    try {
      await api('/api/agent', { method: 'PATCH', body: JSON.stringify(data.settings) })
      toast.success('Configuración del agente guardada')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSavingCfg(false)
    }
  }

  const approveDraft = async (id: string) => {
    setSending(id)
    try {
      await api('/api/agent/reply', { method: 'POST', body: JSON.stringify({ messageId: id, body: editedDraft[id] || undefined }) })
      toast.success('Respuesta enviada')
      load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setSending(null)
    }
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const { settings, stats } = data

  return (
    <div className="space-y-5">
      {/* Estado del agente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-5 w-5 text-emerald-600" />
            Agente IA
            <Badge className={settings.agentEnabled ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 ml-1' : 'bg-slate-100 text-slate-500 hover:bg-slate-100 ml-1'}>
              {settings.agentEnabled ? 'activo' : 'apagado'}
            </Badge>
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={load} aria-label="Recargar">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={runNow} disabled={running} className="bg-emerald-600 hover:bg-emerald-700">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                Ejecutar ciclo
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat icon={<InboxIcon className="h-3.5 w-3.5 text-slate-400" />} label="Sin clasificar" value={stats.pending} />
            <MiniStat icon={<PenLine className="h-3.5 w-3.5 text-teal-500" />} label="Borradores listos" value={stats.drafts} />
            <MiniStat icon={<Flame className="h-3.5 w-3.5 text-rose-500" />} label="Leads calientes" value={stats.hotLeads} />
            <MiniStat icon={<Sparkles className="h-3.5 w-3.5 text-amber-500" />} label="Clasificados hoy" value={stats.classifiedToday} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Agente activo</p>
              <p className="text-xs text-slate-400">Ciclo automático cada ~90 s junto al motor de envío</p>
            </div>
            <Switch
              checked={settings.agentEnabled}
              onCheckedChange={(v) => {
                setData({ ...data, settings: { ...settings, agentEnabled: v } })
                void patchSettings({ agentEnabled: v })
              }}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nivel de autonomía</Label>
              <Select
                value={settings.agentAutonomy}
                onValueChange={(v) => {
                  setData({ ...data, settings: { ...settings, agentAutonomy: v } })
                  void patchSettings({ agentAutonomy: v })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AUTONOMY).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400">{AUTONOMY[settings.agentAutonomy]?.desc}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" /> Hora del informe diario
              </Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={settings.dailyReportHour}
                onChange={(e) => setData({ ...data, settings: { ...settings, dailyReportHour: parseInt(e.target.value || '9', 10) } })}
              />
              <p className="text-xs text-slate-400">El agente te envía el resumen del día a Telegram/WhatsApp a partir de esta hora.</p>
            </div>
          </div>

          {stats.lastEvent && (
            <p className="text-xs text-slate-500 border-l-2 border-emerald-300 pl-2.5">
              Última decisión: {stats.lastEvent}
              {stats.lastEventAt && ` · ${new Date(stats.lastEventAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
            </p>
          )}

          <Accordion type="single" collapsible>
            <AccordionItem value="motor">
              <AccordionTrigger className="text-sm">Motor de IA (opcional — para tu VM de Oracle)</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-xs text-slate-500">
                  En este entorno ya hay IA disponible. En tu VM, para que el agente use un LLM real, pon aquí un endpoint
                  compatible con OpenAI (GLM, OpenAI, Groq, Ollama…). Sin configuración, el agente funciona con reglas
                  heurísticas locales.
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>URL base (…/v1)</Label>
                    <Input
                      value={settings.aiApiUrl}
                      onChange={(e) => setData({ ...data, settings: { ...settings, aiApiUrl: e.target.value } })}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Modelo</Label>
                    <Input
                      value={settings.aiModel}
                      onChange={(e) => setData({ ...data, settings: { ...settings, aiModel: e.target.value } })}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>API key</Label>
                  <Input
                    type="password"
                    value={settings.aiApiKey}
                    onChange={(e) => setData({ ...data, settings: { ...settings, aiApiKey: e.target.value } })}
                    placeholder="sk-…"
                  />
                </div>
                <Button onClick={saveCfg} disabled={savingCfg} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  {savingCfg ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar motor IA'}
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Borradores pendientes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PenLine className="h-4 w-4 text-teal-500" /> Borradores del agente ({drafts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {drafts.length === 0 && (
            <p className="text-sm text-slate-400 py-4 text-center">
              No hay borradores pendientes. El agente redacta respuestas para tus leads según su temperatura.
            </p>
          )}
          {drafts.map((m) => (
            <div key={m.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {m.temperature && <Badge className={`${TEMP_BADGE[m.temperature]} hover:${TEMP_BADGE[m.temperature]}`}>{TEMP_LABEL[m.temperature] || m.temperature}</Badge>}
                <span className="text-sm font-medium truncate">{m.from}</span>
                <span className="text-xs text-slate-400 truncate">{m.subject}</span>
              </div>
              {m.aiSummary && <p className="text-xs text-slate-500">{m.aiSummary}</p>}
              <textarea
                className="w-full rounded-md border bg-slate-50 p-3 text-sm min-h-24 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                value={editedDraft[m.id] ?? m.aiReply ?? ''}
                onChange={(e) => setEditedDraft({ ...editedDraft, [m.id]: e.target.value })}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={() => approveDraft(m.id)} disabled={sending === m.id} className="bg-emerald-600 hover:bg-emerald-700">
                  {sending === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                  Enviar respuesta
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Feed de decisiones */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-slate-500" /> Decisiones y alertas del agente
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 space-y-1 overflow-y-auto">
          {events.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Sin eventos todavía. Pulsa «Ejecutar ciclo».</p>}
          <ul className="divide-y divide-slate-100">
            {events.map((ev) => {
              const style = EVENT_LEVEL_STYLE[ev.level] || EVENT_LEVEL_STYLE.INFO
              return (
                <li key={ev.id} className="py-2 flex items-start gap-2.5 text-sm">
                  <Badge variant="outline" className={`shrink-0 mt-0.5 text-[10px] ${style.badge}`}>
                    {EVENT_TYPE_LABEL[ev.type] || ev.type}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug">{ev.message}</p>
                    <p className="text-[11px] text-slate-400">{new Date(ev.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-slate-50/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-bold text-slate-800 tabular-nums">{value}</p>
    </div>
  )
}

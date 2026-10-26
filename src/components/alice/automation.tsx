'use client'

// AliceMail v3 — Automatización CRM: reglas de re-engagement + enfoques + registro
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Plus, RefreshCw, Compass, Target, Repeat, ArrowRightLeft, Trash2, Zap } from 'lucide-react'
import {
  api, RuleDTO, AngleDTO, CampaignDTO,
  RULE_ACTION_LABEL, RULE_TRIGGER_LABEL,
} from './types'
import { toast } from 'sonner'

interface LogEvent {
  id: string
  type: string
  title: string
  detail: string | null
  leadEmail: string
  leadName: string | null
  createdAt: string
}

export function Automation({ refreshKey }: { refreshKey: number }) {
  const [rules, setRules] = useState<RuleDTO[]>([])
  const [angles, setAngles] = useState<AngleDTO[]>([])
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([])
  const [log, setLog] = useState<LogEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api<{ rules: RuleDTO[] }>('/api/rules'),
      api<{ angles: AngleDTO[] }>('/api/angles'),
      api<CampaignDTO[] | { campaigns: CampaignDTO[] }>('/api/campaigns'),
      api<{ events: LogEvent[] }>('/api/crm/log'),
    ])
      .then(([r, a, c, l]) => {
        const cl = Array.isArray(c) ? c : c.campaigns
        setRules(r.rules)
        setAngles(a.angles)
        setCampaigns(cl || [])
        setLog(l.events)
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load, refreshKey])

  const patchRule = async (id: string, patch: Partial<RuleDTO>) => {
    try {
      await api('/api/rules', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) })
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  const running = campaigns.filter((c) => c.status === 'RUNNING')

  return (
    <div className="space-y-5">
      {/* Reglas de re-engagement */}
      <div>
        <div className="flex items-center gap-2 pb-2">
          <RefreshCw className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-800">Reglas de re-engagement automático</h3>
          <Badge variant="outline" className="text-[10px] text-slate-500">el agente las revisa en cada ciclo (~90 s)</Badge>
        </div>
        <p className="pb-3 text-xs text-slate-500">
          Cuando se cumple una regla, el agente recupera al lead: re-envía el último correo, cambia de enfoque con otro ángulo comercial, o lo mete en otra promoción. Nunca toca leads rechazados ni dados de baja, y espera 72 h entre re-activaciones del mismo lead.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {loading ? (
            <div className="col-span-3 flex justify-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            rules.map((rule) => (
              <Card key={rule.id} className={rule.enabled ? 'border-emerald-200' : 'opacity-75'}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{rule.name}</CardTitle>
                    <Switch checked={rule.enabled} onCheckedChange={(v) => patchRule(rule.id, { enabled: v })} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <p className="text-slate-500">{RULE_TRIGGER_LABEL[rule.trigger] || rule.trigger}</p>
                  <div className="flex items-center gap-2">
                    <Label className="shrink-0 text-slate-500">
                      {rule.trigger === 'OPENS_NO_REPLY' ? 'Aperturas:' : 'Días:'}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={rule.threshold}
                      onChange={(e) => patchRule(rule.id, { threshold: parseInt(e.target.value, 10) || 1 })}
                      className="h-8 w-20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-500">Acción</Label>
                    <Select value={rule.action} onValueChange={(v) => patchRule(rule.id, { action: v })}>
                      <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(RULE_ACTION_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {rule.action === 'NEW_PROMO' && (
                    <div className="space-y-1.5">
                      <Label className="text-slate-500">Promoción destino</Label>
                      <Select value={rule.promoCampaignId || ''} onValueChange={(v) => patchRule(rule.id, { promoCampaignId: v })}>
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue placeholder="Elige campaña…" />
                        </SelectTrigger>
                        <SelectContent>
                          {running.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {running.length === 0 && (
                        <p className="text-[11px] text-amber-600">No hay campañas en marcha. Crea una promoción en Campañas.</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t pt-2 text-[11px] text-slate-400">
                    <span>{rule.firedCount} activaciones</span>
                    {rule.lastRunAt && <span>última: {new Date(rule.lastRunAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Enfoques */}
      <div>
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-800">Enfoques comerciales</h3>
            <Badge variant="outline" className="text-[10px] text-slate-500">los usa el agente para cambiar de estrategia</Badge>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="">
                <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo enfoque
              </Button>
            </DialogTrigger>
            <AngleDialog onDone={() => { setNewOpen(false); load() }} />
          </Dialog>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {angles.map((a) => (
            <Card key={a.id} className={a.active ? '' : 'opacity-60'}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{a.name}</p>
                    {a.description && <p className="truncate text-xs text-slate-400">{a.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.active} onCheckedChange={(v) => api(`/api/angles/${a.id}`, { method: 'PATCH', body: JSON.stringify({ active: v }) }).then(load)} />
                    <Button
                      size="icon" variant="outline" className="h-7 w-7 text-red-500"
                      onClick={() => api(`/api/angles/${a.id}`, { method: 'DELETE' }).then(() => { toast.success('Enfoque eliminado'); load() })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5 text-xs">
                  <p className="font-medium text-slate-700">{a.subject}</p>
                  <p className="mt-1 line-clamp-2 text-slate-500">{a.body}</p>
                </div>
                <p className="text-[10px] text-slate-400">Variables: {'{{nombre}} {{empresa}} {{cargo}}'}</p>
              </CardContent>
            </Card>
          ))}
          {angles.length === 0 && !loading && (
            <p className="py-6 text-center text-xs text-slate-400 md:col-span-2">
              Sin enfoques. Crea al menos uno para que el agente pueda cambiar de estrategia con los leads fríos.
            </p>
          )}
        </div>
      </div>

      {/* Registro de automatización */}
      <div>
        <div className="flex items-center gap-2 pb-2">
          <Zap className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-800">Registro de automatización</h3>
        </div>
        <Card>
          <CardContent className="p-0">
            {log.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                Todavía no hay automatizaciones. Cuando el agente re-active leads aparecerán aquí y en Telegram/WhatsApp.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y">
                {log.map((e) => (
                  <div key={e.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className="mt-0.5">
                      {e.type === 'ANGLE' ? <Compass className="h-4 w-4 text-indigo-500" />
                        : e.type === 'PROMO' ? <Target className="h-4 w-4 text-rose-500" />
                        : e.type === 'REENGAGE' ? <Repeat className="h-4 w-4 text-emerald-500" />
                        : <ArrowRightLeft className="h-4 w-4 text-violet-500" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-700">
                        {e.leadName || e.leadEmail} — {e.title}
                      </p>
                      {e.detail && <p className="truncate text-[11px] text-slate-400">{e.detail}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-300">
                      {new Date(e.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AngleDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', subject: '', body: '' })
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    setLoading(true)
    try {
      await api('/api/angles', { method: 'POST', body: JSON.stringify(form) })
      toast.success('Enfoque creado')
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Nuevo enfoque comercial</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Caso de éxito SaaS" />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ángulo: prueba social" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Asunto *</Label>
          <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="{{nombre}}, una idea para {{empresa}}" />
        </div>
        <div className="space-y-1.5">
          <Label>Cuerpo *</Label>
          <Textarea
            rows={7}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder={'Hola {{nombre}},\n\nVi que {{empresa}}…'}
          />
        </div>
        <Button onClick={submit} disabled={loading || !form.name || !form.subject || !form.body} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear enfoque'}
        </Button>
      </div>
    </DialogContent>
  )
}

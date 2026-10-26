'use client'

// Pestaña Campañas: crear secuencia con follow-ups, inscribir leads, controlar ejecución
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Play, Pause, Users, Trash2, Loader2, MailCheck } from 'lucide-react'
import { api, CampaignDTO } from './types'
import { toast } from 'sonner'

interface StepDraft {
  subject: string
  body: string
  delayDays: number
}

const CAMPAIGN_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Borrador', cls: 'bg-slate-100 text-slate-600' },
  RUNNING: { label: 'En curso', cls: 'bg-emerald-100 text-emerald-700' },
  PAUSED: { label: 'Pausada', cls: 'bg-amber-100 text-amber-800' },
  COMPLETED: { label: 'Completada', cls: 'bg-teal-100 text-teal-800' },
}

export function Campaigns({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [list, setList] = useState<CampaignDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(() => {
    api<CampaignDTO[]>('/api/campaigns')
      .then(setList)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load, refreshKey])

  const setStatus = async (c: CampaignDTO, status: string) => {
    await api(`/api/campaigns/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    toast.success(status === 'RUNNING' ? 'Campaña iniciada' : 'Campaña pausada')
    load()
    onChanged()
  }

  const remove = async (c: CampaignDTO) => {
    await api(`/api/campaigns/${c.id}`, { method: 'DELETE' })
    toast.success('Campaña eliminada')
    load()
    onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Las campañas envían rotando entre buzones verificados y respetando el tope diario total.</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="">
              <Plus className="h-4 w-4 mr-1" /> Nueva campaña
            </Button>
          </DialogTrigger>
          <CreateDialog
            onDone={() => {
              setCreateOpen(false)
              load()
              onChanged()
            }}
          />
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-slate-400">
            Sin campañas todavía. Crea una secuencia: email inicial + follow-ups con variables como {'{{nombre}}'}, {'{{empresa}}'} y {'{{cargo}}'}.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{c.name}</h3>
                    <p className="text-xs text-slate-400">
                      De: {c.fromName} · {c.stepCount} paso(s) · tope {c.dailyTarget}/día {c.trackOpens ? '· tracking ON' : ''}
                    </p>
                  </div>
                  <Badge className={`${CAMPAIGN_STATUS[c.status]?.cls} hover:${CAMPAIGN_STATUS[c.status]?.cls}`}>
                    {CAMPAIGN_STATUS[c.status]?.label || c.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Inscritos" value={c.enrollmentCount} />
                  <MiniStat label="Enviados" value={c.sent} />
                  <MiniStat label="Respuestas" value={c.replied} />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {c.status === 'RUNNING' ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus(c, 'PAUSED')}>
                      <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
                    </Button>
                  ) : (
                    <Button size="sm" className="" onClick={() => setStatus(c, 'RUNNING')}>
                      <Play className="h-3.5 w-3.5 mr-1" /> {c.status === 'PAUSED' ? 'Reanudar' : 'Iniciar'}
                    </Button>
                  )}
                  <EnrollButton campaignId={c.id} count={c.enrollmentCount} onDone={() => { load(); onChanged() }} />
                  <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 ml-auto" onClick={() => remove(c)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <div className="text-lg font-bold tabular-nums text-slate-800">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  )
}

function EnrollButton({ campaignId, count, onDone }: { campaignId: string; count: number; onDone: () => void }) {
  const [loading, setLoading] = useState(false)
  const enroll = async (all: boolean) => {
    setLoading(true)
    try {
      const r = await api<{ enrolled: number; skipped: number }>(`/api/campaigns/${campaignId}/enroll`, {
        method: 'POST',
        body: JSON.stringify(all ? { all: true } : {}),
      })
      toast.success(`${r.enrolled} leads inscritos${r.skipped ? ` (${r.skipped} ya inscritos)` : ''}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Users className="h-3.5 w-3.5 mr-1" /> Leads ({count})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Inscribir leads en la campaña</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Se rotarán automáticamente entre los buzones verificados. Los leads en estado Nuevo o En campaña son elegibles; los respondidos, rebotados o dados de baja se omiten.
          </p>
          <Button disabled={loading} className="w-full" onClick={() => enroll(true)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4 mr-1" />} Inscribir todos los leads elegibles
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [fromName, setFromName] = useState('')
  const [dailyTarget, setDailyTarget] = useState(200)
  const [trackOpens, setTrackOpens] = useState(true)
  const [steps, setSteps] = useState<StepDraft[]>([
    { subject: 'Hola {{nombre}}, idea rápida para {{empresa}}', body: 'Hola {{nombre}},\n\nEscribo porque ayudamos a empresas como {{empresa}} a limpiar y validar sus listas de prospectos antes de cada envío.\n\n¿Te interesaría ver cómo funcionaría para {{empresa}}? Te muestro en 10 minutos.\n\nSaludos,', delayDays: 0 },
  ])
  const [loading, setLoading] = useState(false)

  const updateStep = (i: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  const submit = async () => {
    setLoading(true)
    try {
      await api('/api/campaigns', { method: 'POST', body: JSON.stringify({ name, fromName, dailyTarget, trackOpens, steps }) })
      toast.success('Campaña creada en borrador. Inscríbele leads y pulsar Iniciar.')
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nueva campaña</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Nombre de campaña</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Intro TechDigital Q4" />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre del remitente</Label>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="María de TechDigital" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Tope de envíos/día (total)</Label>
            <Input type="number" value={dailyTarget} onChange={(e) => setDailyTarget(parseInt(e.target.value || '0', 10))} />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={trackOpens} onCheckedChange={setTrackOpens} id="track" />
            <Label htmlFor="track" className="text-sm">Tracking de aperturas</Label>
          </div>
        </div>

        {steps.map((s, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{i === 0 ? 'Email inicial' : `Follow-up ${i}`}</p>
              {i > 0 && (
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs">Enviar tras</Label>
                  <Input
                    type="number"
                    className="h-7 w-16 text-sm"
                    value={s.delayDays}
                    onChange={(e) => updateStep(i, { delayDays: parseInt(e.target.value || '1', 10) })}
                  />
                  <Label className="text-xs">días</Label>
                </div>
              )}
            </div>
            <Input value={s.subject} onChange={(e) => updateStep(i, { subject: e.target.value })} placeholder="Asunto — usa {{nombre}} o {{empresa}}" />
            <Textarea rows={4} value={s.body} onChange={(e) => updateStep(i, { body: e.target.value })} placeholder="Cuerpo del mensaje…" />
          </div>
        ))}

        <Button variant="outline" className="w-full" onClick={() => setSteps((p) => [...p, { subject: 'Re: ' + (p[0]?.subject || ''), body: `Hola {{nombre}}, retomo mi correo anterior por si se te pasó.\n\n¿Tienes 10 minutos esta semana?\n\nSaludos,`, delayDays: 3 }])}>
          <Plus className="h-4 w-4 mr-1" /> Añadir follow-up
        </Button>

        <Button onClick={submit} disabled={loading || !name || !fromName || !steps[0]?.subject || !steps[0]?.body} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear campaña'}
        </Button>
      </div>
    </DialogContent>
  )
}

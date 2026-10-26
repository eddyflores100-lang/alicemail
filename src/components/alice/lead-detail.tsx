'use client'

// AliceMail v3 — Ficha del lead: timeline CRM + acciones de re-engagement
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Loader2, Send, Eye, Reply, AlertTriangle, RefreshCw, Compass, Target, ArrowRightLeft, StickyNote, Bot, Upload, Flame, Thermometer, Zap, Megaphone, MessageSquare, Repeat } from 'lucide-react'
import {
  api, LeadDetailDTO, AngleDTO, CampaignDTO,
  STAGE_ORDER, STAGE_LABEL_V3, TEMP_LABEL, TEMP_BADGE,
} from './types'
import { toast } from 'sonner'

const EVENT_ICON: Record<string, React.ReactNode> = {
  STAGE: <ArrowRightLeft className="h-3.5 w-3.5" />,
  SENT: <Send className="h-3.5 w-3.5" />,
  OPEN: <Eye className="h-3.5 w-3.5" />,
  REPLY: <Reply className="h-3.5 w-3.5" />,
  BOUNCE: <AlertTriangle className="h-3.5 w-3.5" />,
  REENGAGE: <RefreshCw className="h-3.5 w-3.5" />,
  ANGLE: <Compass className="h-3.5 w-3.5" />,
  PROMO: <Target className="h-3.5 w-3.5" />,
  NOTE: <StickyNote className="h-3.5 w-3.5" />,
  AGENT: <Bot className="h-3.5 w-3.5" />,
  IMPORT: <Upload className="h-3.5 w-3.5" />,
}

const EVENT_COLOR: Record<string, string> = {
  STAGE: 'bg-violet-100 text-violet-600',
  SENT: 'bg-slate-100 text-slate-500',
  OPEN: 'bg-teal-100 text-teal-700',
  REPLY: 'bg-teal-100 text-teal-600',
  BOUNCE: 'bg-amber-100 text-amber-600',
  REENGAGE: 'bg-emerald-100 text-emerald-600',
  ANGLE: 'bg-indigo-100 text-indigo-600',
  PROMO: 'bg-rose-100 text-rose-600',
  NOTE: 'bg-yellow-100 text-yellow-600',
  AGENT: 'bg-emerald-100 text-emerald-600',
  IMPORT: 'bg-slate-100 text-slate-400',
}

export function LeadDetailSheet({ leadId, onClose, onChanged }: { leadId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<LeadDetailDTO | null>(null)
  const [angles, setAngles] = useState<AngleDTO[]>([])
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [angleDialog, setAngleDialog] = useState(false)
  const [promoDialog, setPromoDialog] = useState(false)
  const [angleId, setAngleId] = useState('')
  const [campaignId, setCampaignId] = useState('')

  const load = useCallback(() => {
    api<LeadDetailDTO>(`/api/leads/${leadId}`).then(setData).catch((e) => toast.error(e.message))
  }, [leadId])

  useEffect(() => {
    load()
    api<{ angles: AngleDTO[] }>('/api/angles').then((d) => setAngles(d.angles.filter((a) => a.active))).catch(() => {})
    api<CampaignDTO[] | { campaigns: CampaignDTO[] }>('/api/campaigns')
      .then((d) => {
        const list = Array.isArray(d) ? d : d.campaigns
        setCampaigns((list || []).filter((c) => c.status === 'RUNNING'))
      })
      .catch(() => {})
  }, [load])

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const { lead, replies } = data
  const doAction = async (body: Record<string, unknown>, key: string, okMsg?: string) => {
    setBusy(key)
    try {
      const r = await api<{ ok: boolean; message: string }>(`/api/leads/${lead.id}/actions`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (r.ok) {
        toast.success(okMsg || r.message)
        load()
        onChanged()
      } else {
        toast.error(r.message)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  const moveStage = async (stage: string) => {
    setBusy('stage')
    try {
      await api(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ stage }) })
      toast.success(`Etapa: ${STAGE_LABEL_V3[stage]}`)
      load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  const addNote = async () => {
    if (!note.trim()) return
    setBusy('note')
    try {
      await api(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ note }) })
      setNote('')
      toast.success('Nota añadida')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="space-y-0 border-b p-4">
        <SheetTitle className="flex items-center gap-2 text-base">
          <span className="truncate">{lead.name || lead.email}</span>
          {lead.temperature === 'HOT' && <Flame className="h-4 w-4 text-rose-500" />}
        </SheetTitle>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-slate-500">{lead.email}</span>
          <Badge className={`${TEMP_BADGE[lead.temperature] || TEMP_BADGE.COLD} gap-1`}>
            <Thermometer className="h-3 w-3" /> {TEMP_LABEL[lead.temperature] || lead.temperature}
          </Badge>
          {lead.company && <span className="text-xs text-slate-500">· {lead.company}</span>}
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Métricas de engagement */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-slate-50 p-2.5 text-center">
            <p className="text-lg font-bold text-slate-800 tabular-nums">{lead.score}</p>
            <p className="flex items-center justify-center gap-1 text-[10px] text-slate-500"><Zap className="h-3 w-3" /> Score</p>
          </div>
          <div className="rounded-lg border bg-slate-50 p-2.5 text-center">
            <p className="text-lg font-bold text-slate-800 tabular-nums">{lead.openCount}</p>
            <p className="flex items-center justify-center gap-1 text-[10px] text-slate-500"><Eye className="h-3 w-3" /> Aperturas</p>
          </div>
          <div className="rounded-lg border bg-slate-50 p-2.5 text-center">
            <p className="text-lg font-bold text-slate-800 tabular-nums">{lead.reengagedCount}</p>
            <p className="flex items-center justify-center gap-1 text-[10px] text-slate-500"><RefreshCw className="h-3 w-3" /> Re-activos</p>
          </div>
        </div>
        {lead.currentAngle && (
          <p className="text-xs text-slate-500">
            Último enfoque usado: <span className="font-semibold text-slate-700">“{lead.currentAngle}”</span>
          </p>
        )}
        {lead.aiNotes && (
          <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <Bot className="mr-1 inline h-3.5 w-3.5" /> {lead.aiNotes}
          </p>
        )}

        {/* Cambiar etapa */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Etapa del pipeline</Label>
          <Select value={lead.stage} onValueChange={moveStage} disabled={busy === 'stage'}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGE_ORDER.map((st) => (
                <SelectItem key={st} value={st}>{STAGE_LABEL_V3[st]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Acciones de re-engagement */}
        <div className="grid grid-cols-1 gap-2">
          <Button variant="outline" className="justify-start" disabled={!!busy} onClick={() => doAction({ action: 'resend' }, 'resend')}>
            {busy === 'resend' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
            Re-enviar ahora
          </Button>
          <Button variant="outline" className="justify-start" disabled={!!busy || angles.length === 0} onClick={() => setAngleDialog(true)}>
            <Compass className="h-4 w-4" /> Cambiar de enfoque
          </Button>
          <Button variant="outline" className="justify-start" disabled={!!busy || campaigns.length === 0} onClick={() => setPromoDialog(true)}>
            <Megaphone className="h-4 w-4" /> Meter en otra promoción
          </Button>
          {angles.length === 0 && (
            <p className="text-[11px] text-slate-400">Crea enfoques en la sección Automatización para cambiar de estrategia.</p>
          )}
        </div>

        {/* Nota */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Añadir nota al historial</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: llamada el jueves, pidió propuesta…" />
          <Button size="sm" variant="outline" onClick={addNote} disabled={!note.trim() || busy === 'note'}>
            {busy === 'note' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />} Guardar nota
          </Button>
        </div>

        {/* Promociones activas del lead */}
        {lead.enrollments.length > 0 && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs text-slate-500"><Megaphone className="h-3.5 w-3.5" /> Promociones</Label>
            {lead.enrollments.map((en) => (
              <div key={en.id} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                <span className="font-medium text-slate-700">{en.campaign.name}</span>
                <span className="text-slate-400">paso {en.currentStep} · {en.status === 'REPLIED' ? 'respondió' : en.status === 'FINISHED' ? 'terminada' : en.status === 'QUEUED' ? 'en cola' : 'en curso'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Respuestas clasificadas */}
        {replies.length > 0 && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs text-slate-500"><MessageSquare className="h-3.5 w-3.5" /> Respuestas</Label>
            {replies.slice(0, 3).map((r) => (
              <div key={r.id} className="rounded-lg border p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-slate-700">{r.subject}</span>
                  {r.temperature && (
                    <Badge className={`${TEMP_BADGE[r.temperature]} shrink-0 text-[10px]`}>{TEMP_LABEL[r.temperature]}</Badge>
                  )}
                </div>
                {r.aiSummary && <p className="mt-1 text-slate-500">{r.aiSummary}</p>}
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Timeline */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Historial completo</Label>
          <div className="space-y-0">
            {lead.events.map((ev) => (
              <div key={ev.id} className="flex gap-2.5 py-1.5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${EVENT_COLOR[ev.type] || EVENT_COLOR.SENT}`}>
                  {EVENT_ICON[ev.type] || <Bot className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-700">{ev.title}</p>
                  {ev.detail && <p className="truncate text-[11px] text-slate-400">{ev.detail}</p>}
                  <p className="text-[10px] text-slate-300">
                    {new Date(ev.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {lead.events.length === 0 && <p className="py-4 text-center text-xs text-slate-300">Sin actividad todavía</p>}
          </div>
        </div>
      </div>

      {/* Diálogo cambiar enfoque */}
      <Dialog open={angleDialog} onOpenChange={setAngleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar de enfoque con {lead.name || lead.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Se enviará ahora mismo un correo con el enfoque elegido (adaptado con el nombre y la empresa del lead).
            </p>
            <Select value={angleId} onValueChange={setAngleId}>
              <SelectTrigger><SelectValue placeholder="Elige un enfoque…" /></SelectTrigger>
              <SelectContent>
                {angles.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <Compass className="h-3.5 w-3.5" /> {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {angleId && (
              <div className="rounded-lg border bg-slate-50 p-2.5 text-xs">
                <p className="font-semibold text-slate-700">{angles.find((a) => a.id === angleId)?.subject}</p>
                <p className="mt-1 line-clamp-3 text-slate-500">{angles.find((a) => a.id === angleId)?.body}</p>
              </div>
            )}
            <Button
              className="w-full"
              disabled={!angleId || !!busy}
              onClick={async () => {
                await doAction({ action: 'change_angle', angleId }, 'angle')
                setAngleDialog(false)
              }}
            >
              {busy === 'angle' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar con este enfoque
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo otra promoción */}
      <Dialog open={promoDialog} onOpenChange={setPromoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Meter a {lead.name || lead.email} en otra promoción</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              El lead entrará en la campaña elegida y el motor le enviará el primer correo de esa promoción en ~30 minutos.
            </p>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="Elige una campaña en marcha…" /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!campaignId || !!busy}
              onClick={async () => {
                await doAction({ action: 'add_promo', campaignId }, 'promo')
                setPromoDialog(false)
              }}
            >
              {busy === 'promo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />} Añadir a la promoción
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

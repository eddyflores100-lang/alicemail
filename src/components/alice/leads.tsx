'use client'

// AliceMail v3 — CRM de leads: kanban por etapas + tabla + ficha con timeline
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Upload, Plus, Loader2, Search, ChevronLeft, ChevronRight, Trash2, Pause,
  Thermometer, Eye, Flame, RefreshCw, GripVertical,
} from 'lucide-react'
import {
  api, LeadDTO, TEMP_LABEL, TEMP_BADGE,
  STAGE_ORDER, STAGE_LABEL_V3, STAGE_BADGE, STAGE_DOT,
} from './types'
import { LeadDetailSheet } from './lead-detail'
import { toast } from 'sonner'

interface LeadsResp {
  total: number
  stageCounts: Record<string, number>
  leads: LeadDTO[]
}

export function Leads({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [data, setData] = useState<LeadsResp>({ total: 0, stageCounts: {}, leads: [] })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [stage, setStage] = useState('')
  const [view, setView] = useState<'pipeline' | 'tabla'>('pipeline')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const pageSize = 50

  const load = useCallback(() => {
    setLoading(true)
    api<LeadsResp>(
      `/api/leads?q=${encodeURIComponent(q)}&stage=${stage}&pageSize=${view === 'pipeline' ? 200 : pageSize}&page=${page}`
    )
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [q, stage, page, view])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load, refreshKey])

  const moveStage = async (leadId: string, newStage: string) => {
    const lead = data.leads.find((l) => l.id === leadId)
    if (!lead || lead.stage === newStage) return
    try {
      await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ stage: newStage }) })
      toast.success(`${lead.name || lead.email} → ${STAGE_LABEL_V3[newStage]}`)
      load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error moviendo lead')
    }
  }

  const pause = async (lead: LeadDTO) => {
    await api(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'PAUSED' }) })
    toast.success('Lead pausado')
    load()
    onChanged()
  }

  const remove = async (lead: LeadDTO) => {
    await api(`/api/leads/${lead.id}`, { method: 'DELETE' })
    toast.success('Lead eliminado')
    load()
    onChanged()
  }

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))
  const chip = (st: string) => {
    const active = stage === st
    const n = data.stageCounts[st] || 0
    return (
      <button
        key={st}
        onClick={() => { setStage(active ? '' : st); setPage(1) }}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
          active ? `${STAGE_BADGE[st]} ring-2 ring-offset-1 ring-slate-300` : `${STAGE_BADGE[st]} opacity-80 hover:opacity-100`
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${STAGE_DOT[st]}`} />
        {STAGE_LABEL_V3[st]}
        <span className="tabular-nums font-bold">{n}</span>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {/* Embudo por etapas */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => { setStage(''); setPage(1) }}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            stage === '' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todos <span className="tabular-nums font-bold">{data.total}</span>
        </button>
        {STAGE_ORDER.map(chip)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Buscar por email, nombre o empresa…" className="pl-9" />
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as 'pipeline' | 'tabla')}>
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="tabla">Tabla</TabsTrigger>
          </TabsList>
        </Tabs>
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50">
              <Upload className="h-4 w-4 mr-1" /> Importar CSV
            </Button>
          </DialogTrigger>
          <ImportDialog onDone={() => { setImportOpen(false); load(); onChanged() }} />
        </Dialog>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-1" /> Añadir
            </Button>
          </DialogTrigger>
          <AddLeadDialog onDone={() => { setAddOpen(false); load(); onChanged() }} />
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : view === 'pipeline' ? (
        <KanbanBoard
          leads={data.leads}
          dragId={dragId}
          dragOver={dragOver}
          onDragStart={(id) => setDragId(id)}
          onDragEnd={() => { setDragId(null); setDragOver(null) }}
          onDragOverCol={(st) => setDragOver(st)}
          onDropCol={(st) => { if (dragId) moveStage(dragId, st); setDragId(null); setDragOver(null) }}
          onOpen={(id) => setDetailId(id)}
        />
      ) : (
        <LeadsTable leads={data.leads} onOpen={setDetailId} onPause={pause} onRemove={remove} />
      )}

      {view === 'tabla' && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{data.total} lead(s) en total</span>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums">{page} / {totalPages}</span>
            <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent side="right" aria-describedby={undefined} className="w-full sm:max-w-lg p-0 overflow-y-auto">
          {detailId && (
            <LeadDetailSheet
              leadId={detailId}
              onClose={() => setDetailId(null)}
              onChanged={() => { load(); onChanged() }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── Kanban pipeline ─────────────────────────────────────────────────
function KanbanBoard({
  leads, dragId, dragOver, onDragStart, onDragEnd, onDragOverCol, onDropCol, onOpen,
}: {
  leads: LeadDTO[]
  dragId: string | null
  dragOver: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOverCol: (stage: string) => void
  onDropCol: (stage: string) => void
  onOpen: (id: string) => void
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
      {STAGE_ORDER.map((st) => {
        const col = leads.filter((l) => l.stage === st)
        const isOver = dragOver === st
        return (
          <div
            key={st}
            onDragOver={(e) => { e.preventDefault(); onDragOverCol(st) }}
            onDragLeave={() => onDragOverCol('')}
            onDrop={() => onDropCol(st)}
            className={`w-60 shrink-0 rounded-xl border p-2 transition-colors ${
              isOver ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className={`h-2.5 w-2.5 rounded-full ${STAGE_DOT[st]}`} />
              <span className="text-xs font-semibold text-slate-700">{STAGE_LABEL_V3[st]}</span>
              <span className="ml-auto text-xs font-bold text-slate-400 tabular-nums">{col.length}</span>
            </div>
            <div className="space-y-2 min-h-24">
              {col.length === 0 && (
                <p className="py-6 text-center text-[11px] text-slate-300">Suelta leads aquí</p>
              )}
              {col.map((l) => (
                <div
                  key={l.id}
                  draggable
                  onDragStart={() => onDragStart(l.id)}
                  onDragEnd={onDragEnd}
                  onClick={() => onOpen(l.id)}
                  className={`group cursor-grab active:cursor-grabbing rounded-lg border bg-white p-2.5 shadow-sm transition-all hover:shadow-md hover:border-emerald-300 ${
                    dragId === l.id ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <GripVertical className="h-3.5 w-3.5 mt-0.5 text-slate-300 group-hover:text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800">{l.name || l.email.split('@')[0]}</p>
                      <p className="truncate text-[11px] text-slate-400">{l.email}</p>
                      {l.company && <p className="truncate text-[11px] text-slate-500">{l.company}</p>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${TEMP_BADGE[l.temperature] || TEMP_BADGE.COLD}`}>
                      <Thermometer className="h-2.5 w-2.5" />
                      {TEMP_LABEL[l.temperature] || l.temperature}
                    </span>
                    {l.openCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
                        <Eye className="h-2.5 w-2.5" /> {l.openCount}
                      </span>
                    )}
                    {l.reengagedCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1 py-0.5 text-[10px] text-emerald-600" title="Re-activado por el agente">
                        <RefreshCw className="h-2.5 w-2.5" /> {l.reengagedCount}
                      </span>
                    )}
                    {l.temperature === 'HOT' && <Flame className="h-3 w-3 text-rose-500" />}
                    {l.score > 0 && <span className="ml-auto text-[10px] font-bold text-slate-400 tabular-nums" title="Puntos de engagement">⚡{l.score}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tabla clásica ───────────────────────────────────────────────────
function LeadsTable({
  leads, onOpen, onPause, onRemove,
}: {
  leads: LeadDTO[]
  onOpen: (id: string) => void
  onPause: (l: LeadDTO) => void
  onRemove: (l: LeadDTO) => void
}) {
  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <p className="py-16 text-center text-sm text-slate-400">
            Sin leads. Importa el CSV que exporta <strong>TechDigital Prospect</strong> tras limpiar tu lista.
          </p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Temperatura</TableHead>
              <TableHead className="text-center">Aperturas</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => onOpen(l.id)}>
                <TableCell className="font-medium">
                  <span className="block">{l.email}</span>
                  {l.name && <span className="block text-[11px] text-slate-400">{l.name}</span>}
                </TableCell>
                <TableCell>{l.company || '—'}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STAGE_BADGE[l.stage] || STAGE_BADGE.NUEVO}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[l.stage] || STAGE_DOT.NUEVO}`} />
                    {STAGE_LABEL_V3[l.stage] || l.stage}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge className={`${TEMP_BADGE[l.temperature] || TEMP_BADGE.COLD} gap-1`}>
                    <Thermometer className="h-3 w-3" />
                    {TEMP_LABEL[l.temperature] || l.temperature}
                  </Badge>
                </TableCell>
                <TableCell className="text-center tabular-nums">{l.openCount}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8" title="Pausar" onClick={() => onPause(l)}>
                      <Pause className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8 text-red-500 hover:text-red-600" title="Eliminar" onClick={() => onRemove(l)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── Diálogos de importar y añadir (igual que v2) ────────────────────
function ImportDialog({ onDone }: { onDone: () => void }) {
  const [csv, setCsv] = useState('')
  const [loading, setLoading] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (file) setCsv(await file.text())
  }

  const submit = async () => {
    setLoading(true)
    try {
      const r = await api<{ created: number; duplicated: number; rejected: number }>('/api/leads/import', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      })
      toast.success(`${r.created} leads importados (${r.duplicated} duplicados omitidos)`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error importando')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Importar leads desde CSV</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <Label className="text-xs text-slate-500">
          Formato: <code className="bg-slate-100 px-1 rounded">email, nombre, empresa, cargo</code> (separador: coma, ; o tabulador). Entrarán en la etapa <strong>Nuevo</strong> del pipeline.
        </Label>
        <Input type="file" accept=".csv,.txt" onChange={(e) => onFile(e.target.files?.[0])} />
        <Textarea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={'maria.lopez@acme.com,Maria Lopez,Acme Inc,Directora\njgarcia@globex.es,Juan Garcia,Globex,CEO'}
          className="font-mono text-xs"
        />
        <Button onClick={submit} disabled={loading || !csv.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Importar'}
        </Button>
      </div>
    </DialogContent>
  )
}

function AddLeadDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ email: '', name: '', company: '', position: '' })
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    setLoading(true)
    try {
      await api('/api/leads', { method: 'POST', body: JSON.stringify(form) })
      toast.success('Lead añadido al pipeline')
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Añadir lead</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        {(['email', 'name', 'company', 'position'] as const).map((f) => (
          <div key={f} className="space-y-1.5">
            <Label>{f === 'email' ? 'Email *' : f === 'name' ? 'Nombre' : f === 'company' ? 'Empresa' : 'Cargo'}</Label>
            <Input value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
          </div>
        ))}
        <Button onClick={submit} disabled={loading || !form.email} className="w-full bg-emerald-600 hover:bg-emerald-700">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
        </Button>
      </div>
    </DialogContent>
  )
}

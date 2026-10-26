'use client'

// Pestaña Buzones: alta con presets, verificación SMTP/IMAP, control warmup
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus, PlugZap, Pause, Play, RotateCcw, Trash2, Loader2, RefreshCw } from 'lucide-react'
import { api, MailboxDTO, MB_STATUS_LABEL, MB_STATUS_COLOR } from './types'
import { toast } from 'sonner'

const PROVIDERS = [
  { value: 'GMAIL', label: 'Gmail / Workspace' },
  { value: 'M365', label: 'Microsoft 365' },
  { value: 'SMTP', label: 'SMTP propio' },
]

export function Mailboxes({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [list, setList] = useState<MailboxDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(() => {
    api<MailboxDTO[]>('/api/mailboxes')
      .then(setList)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load, refreshKey])

  const doTest = async (mb: MailboxDTO) => {
    setTesting(mb.id)
    try {
      const r = await api<{ ok: boolean; smtp: boolean; imap: boolean; error?: string }>(`/api/mailboxes/${mb.id}/test`, { method: 'POST' })
      if (r.ok) toast.success(`✓ ${mb.email} verificado (SMTP + IMAP)`)
      else toast.error(r.error || 'Fallo de conexión', { description: r.smtp ? 'IMAP falló' : 'SMTP falló — revisa credenciales' })
      load()
      onChanged()
    } finally {
      setTesting('')
    }
  }

  const setStatus = async (mb: MailboxDTO, status: string) => {
    await api(`/api/mailboxes/${mb.id}`, { method: 'PATCH', body: JSON.stringify({ status, clearError: true }) })
    toast.success(status === 'PAUSED' ? 'Buzón pausado' : 'Buzón reanudado')
    load()
    onChanged()
  }

  const restartWarmup = async (mb: MailboxDTO) => {
    await api(`/api/mailboxes/${mb.id}`, { method: 'PATCH', body: JSON.stringify({ restartWarmup: true }) })
    toast.success('Warmup reiniciado desde hoy')
    load()
    onChanged()
  }

  const remove = async (mb: MailboxDTO) => {
    await api(`/api/mailboxes/${mb.id}`, { method: 'DELETE' })
    toast.success('Buzón eliminado')
    load()
    onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {list.length} buzón(es) · {list.filter((m) => m.verified).length} verificados · capacidad diaria total:{' '}
          <strong className="text-emerald-600">{list.filter((m) => m.verified).reduce((a, m) => a + m.campaignDailyLimit, 0)}</strong> correos de campaña
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-1" /> Añadir buzón
            </Button>
          </DialogTrigger>
          <AddMailboxDialog
            onCreated={() => {
              setDialogOpen(false)
              load()
              onChanged()
            }}
          />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              Sin buzones todavía. Añade tu primer buzón (Gmail con contraseña de aplicación, M365 o SMTP propio).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buzón</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Warmup hoy</TableHead>
                  <TableHead className="text-right">Campaña hoy</TableHead>
                  <TableHead className="text-right">Límite</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((mb) => (
                  <TableRow key={mb.id}>
                    <TableCell>
                      <div className="font-medium">{mb.displayName}</div>
                      <div className="text-xs text-slate-400">{mb.email}</div>
                      <div className="text-xs text-slate-400">
                        {PROVIDERS.find((p) => p.value === mb.provider)?.label || mb.provider}
                      </div>
                      {mb.lastError && <div className="text-xs text-red-500 truncate max-w-56 mt-0.5" title={mb.lastError}>⚠ {mb.lastError}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <Badge className={`${MB_STATUS_COLOR[mb.status]} hover:${MB_STATUS_COLOR[mb.status]}`}>{MB_STATUS_LABEL[mb.status] || mb.status}</Badge>
                        {mb.verified ? (
                          <span className="text-xs text-emerald-600">✓ verificado</span>
                        ) : (
                          <span className="text-xs text-amber-600">sin verificar</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{mb.sentWarmupToday}</TableCell>
                    <TableCell className="text-right tabular-nums">{mb.sentCampaignToday}</TableCell>
                    <TableCell className="text-right tabular-nums">{mb.campaignDailyLimit}/día</TableCell>
                    <TableCell className="text-right">
                      <TooltipProvider delayDuration={200}>
                        <div className="flex justify-end gap-1">
                          <TipBtn label={mb.verified ? 'Re-verificar' : 'Verificar conexión'}>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => doTest(mb)} disabled={testing === mb.id}>
                              {testing === mb.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                            </Button>
                          </TipBtn>
                          <TipBtn label="Reiniciar warmup">
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => restartWarmup(mb)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </TipBtn>
                          <TipBtn label={mb.status === 'PAUSED' ? 'Reanudar' : 'Pausar'}>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setStatus(mb, mb.status === 'PAUSED' ? 'WARMUP' : 'PAUSED')}>
                              {mb.status === 'PAUSED' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                            </Button>
                          </TipBtn>
                          <TipBtn label="Eliminar">
                            <Button size="icon" variant="outline" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => remove(mb)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TipBtn>
                        </div>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TipBtn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="text-xs">{label}</TooltipContent>
    </Tooltip>
  )
}

function AddMailboxDialog({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    email: '',
    displayName: '',
    provider: 'GMAIL',
    smtpPass: '',
    imapPass: '',
    campaignDailyLimit: 20,
    warmupStart: 3,
    warmupMax: 25,
    warmupRamp: 2,
  })
  const [saving, setSaving] = useState(false)
  const isCustom = form.provider === 'SMTP'

  const submit = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { ...form }
      if (!isCustom) {
        body.smtpUser = form.email
        body.imapUser = form.email
        body.imapPass = form.smtpPass // Gmail/M365 usan la misma contraseña de aplicación
      } else {
        body.smtpHost = form['smtpHost'] || ''
        body.imapHost = form['imapHost'] || ''
      }
      await api('/api/mailboxes', { method: 'POST', body: JSON.stringify(body) })
      toast.success('Buzón creado. Ahora pulsa "Verificar conexión".')
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Añadir buzón de envío</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="maria@techdigital.site" />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre visible</Label>
            <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="María Pérez" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Proveedor</Label>
          <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.provider === 'GMAIL' && (
            <p className="text-xs text-slate-500">Gmail requiere 2FA + <strong>contraseña de aplicación</strong> (myaccount.google.com/apppasswords). Usa smtp.gmail.com:465 e imap.gmail.com:993.</p>
          )}
          {form.provider === 'M365' && (
            <p className="text-xs text-slate-500">M365: smtp.office365.com:587 (STARTTLS) y outlook.office365.com:993.</p>
          )}
        </div>

        {isCustom && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Servidor SMTP</Label>
              <Input onChange={(e) => setForm({ ...form, ['smtpHost']: e.target.value })} placeholder="mail.midominio.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Servidor IMAP</Label>
              <Input onChange={(e) => setForm({ ...form, ['imapHost']: e.target.value })} placeholder="mail.midominio.com" />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Contraseña de aplicación {isCustom && '(SMTP / IMAP)'}</Label>
          <Input
            type="password"
            value={form.smtpPass}
            onChange={(e) => setForm({ ...form, smtpPass: e.target.value, imapPass: e.target.value })}
            placeholder="•••• •••• •••• ••••"
          />
        </div>

        <div className="rounded-lg bg-slate-50 p-3 space-y-3">
          <p className="text-xs font-medium text-slate-500">Parámetros de warmup</p>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Inicio" value={form.warmupStart} onChange={(v) => setForm({ ...form, warmupStart: v })} />
            <Field label="+/día" value={form.warmupRamp} onChange={(v) => setForm({ ...form, warmupRamp: v })} />
            <Field label="Techo" value={form.warmupMax} onChange={(v) => setForm({ ...form, warmupMax: v })} />
            <Field label="Campaña" value={form.campaignDailyLimit} onChange={(v) => setForm({ ...form, campaignDailyLimit: v })} />
          </div>
        </div>

        <Button onClick={submit} disabled={saving || !form.email || !form.displayName || !form.smtpPass} className="w-full bg-emerald-600 hover:bg-emerald-700">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear buzón'}
        </Button>
      </div>
    </DialogContent>
  )
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        className="h-8 text-sm"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
      />
    </div>
  )
}

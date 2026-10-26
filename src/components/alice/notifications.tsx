'use client'

// Página Notificaciones: canales Telegram/WhatsApp, eventos, prueba e historial
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bell, Loader2, Send, MessageCircle, Smartphone, Lock } from 'lucide-react'
import { api, SettingsDTO, NotificationDTO } from './types'
import { toast } from 'sonner'

const EVENTS: { id: string; label: string; desc: string }[] = [
  { id: 'reply', label: 'Respuestas', desc: 'Cada respuesta de un contacto' },
  { id: 'hot', label: 'Contactos calientes', desc: 'Interés claro detectado (alerta inmediata)' },
  { id: 'bounce', label: 'Rebotes', desc: 'Pico de rebotes en un buzón' },
  { id: 'error', label: 'Errores', desc: 'Buzón con fallos SMTP repetidos' },
  { id: 'daily', label: 'Informe diario', desc: 'Resumen del día con cuota y resultados' },
]

export function Notifications({ refreshKey }: { refreshKey: number }) {
  const [s, setS] = useState<SettingsDTO | null>(null)
  const [log, setLog] = useState<NotificationDTO[]>([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [newTelegramToken, setNewTelegramToken] = useState('')
  const [newWaToken, setNewWaToken] = useState('')

  const load = useCallback(() => {
    api<SettingsDTO>('/api/settings').then(setS).catch((e) => toast.error(e.message))
    api<{ items: NotificationDTO[] }>('/api/notifications').then((d) => setLog(d.items)).catch(() => {})
  }, [])

  useEffect(load, [load, refreshKey])

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      await api('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          notifyChannel: s.notifyChannel,
          notifyTelegramToken: newTelegramToken || undefined,
          notifyTelegramChat: s.notifyTelegramChat,
          notifyWaPhoneId: s.notifyWaPhoneId,
          notifyWaToken: newWaToken || undefined,
          notifyWaTo: s.notifyWaTo,
          notifyEvents: s.notifyEvents,
          dailyReportHour: s.dailyReportHour,
        }),
      })
      setNewTelegramToken('')
      setNewWaToken('')
      toast.success('Notificaciones guardadas — los tokens se cifran automáticamente')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      const r = await api<{ ok: boolean; sent: number; failed: number; skipped: boolean }>('/api/notify/test', { method: 'POST' })
      if (r.skipped) toast.info('Canal en desactivado o credenciales incompletas — configura y guarda primero')
      else if (r.ok) toast.success(`Enviado a ${r.sent} canal(es) — revisa tu móvil`)
      else toast.error(`Falló el envío (${r.failed}) — revisa token/chat`)
      load()
    } catch {
      toast.error('No se pudo lanzar la prueba')
    } finally {
      setTesting(false)
    }
  }

  const toggleEvent = (id: string) => {
    if (!s) return
    const list = s.notifyEvents.split(',').filter(Boolean)
    const next = list.includes(id) ? list.filter((e) => e !== id) : [...list, id]
    setS({ ...s, notifyEvents: next.join(',') })
  }

  if (!s) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Canales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Canal de avisos</Label>
              <Select value={s.notifyChannel} onValueChange={(v) => setS({ ...s, notifyChannel: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OFF">Desactivado</SelectItem>
                  <SelectItem value="TELEGRAM">Telegram</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="BOTH">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Telegram */}
            <div className={`rounded-lg border p-3 space-y-3 ${s.notifyChannel === 'TELEGRAM' || s.notifyChannel === 'BOTH' ? '' : 'opacity-50'}`}>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5 text-chart-2" /> Telegram
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center justify-between">
                  Bot token (de @BotFather)
                  <span className={`text-[10px] flex items-center gap-1 ${s.hasTelegramToken ? 'text-chart-2' : 'text-muted-foreground'}`}>
                    <Lock className="h-3 w-3" /> {s.hasTelegramToken ? 'guardado y cifrado' : 'sin configurar'}
                  </span>
                </Label>
                <Input
                  type="password"
                  value={newTelegramToken}
                  onChange={(e) => setNewTelegramToken(e.target.value)}
                  placeholder={s.hasTelegramToken ? '•••••••• — deja vacío para conservar' : '123456:ABC-DEF…'}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Chat ID (de @userinfobot)</Label>
                <Input
                  value={s.notifyTelegramChat}
                  onChange={(e) => setS({ ...s, notifyTelegramChat: e.target.value })}
                  placeholder="123456789"
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div className={`rounded-lg border p-3 space-y-3 ${s.notifyChannel === 'WHATSAPP' || s.notifyChannel === 'BOTH' ? '' : 'opacity-50'}`}>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-chart-2" /> WhatsApp Cloud API (Meta)
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone Number ID</Label>
                <Input
                  value={s.notifyWaPhoneId}
                  onChange={(e) => setS({ ...s, notifyWaPhoneId: e.target.value })}
                  placeholder="123456789012345"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center justify-between">
                  Token permanente
                  <span className={`text-[10px] flex items-center gap-1 ${s.hasWaToken ? 'text-chart-2' : 'text-muted-foreground'}`}>
                    <Lock className="h-3 w-3" /> {s.hasWaToken ? 'guardado y cifrado' : 'sin configurar'}
                  </span>
                </Label>
                <Input
                  type="password"
                  value={newWaToken}
                  onChange={(e) => setNewWaToken(e.target.value)}
                  placeholder={s.hasWaToken ? '•••••••• — deja vacío para conservar' : 'EAAG…'}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tu número (con código país)</Label>
                <Input
                  value={s.notifyWaTo}
                  onChange={(e) => setS({ ...s, notifyWaTo: e.target.value })}
                  placeholder="+593 99 123 4567"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
              <Button variant="outline" onClick={test} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Smartphone className="h-4 w-4 mr-1" />}
                Enviar prueba
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Los tokens se almacenan cifrados con AES-256-GCM y nunca se vuelven a mostrar: solo se sustituyen si escribes uno nuevo.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Eventos que te aviso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {EVENTS.map((ev) => (
              <label key={ev.id} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted">
                <Checkbox checked={s.notifyEvents.includes(ev.id)} onCheckedChange={() => toggleEvent(ev.id)} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{ev.label}</span>
                  <span className="block text-xs text-muted-foreground">{ev.desc}</span>
                </span>
              </label>
            ))}
            <div className="space-y-1.5 pt-2">
              <Label>Hora del informe diario</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={s.dailyReportHour}
                onChange={(e) => setS({ ...s, dailyReportHour: parseInt(e.target.value || '9', 10) })}
                className="w-28"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Guarda los cambios para aplicarlos. El informe diario sale una vez al día (a partir de la hora indicada).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Historial de notificaciones</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            {log.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Aún no se ha enviado ninguna notificación.</p>}
            <ul className="divide-y">
              {log.map((n) => (
                <li key={n.id} className="py-2.5 flex items-start gap-2.5 text-sm">
                  <Badge
                    variant="outline"
                    className={`shrink-0 mt-0.5 text-[10px] ${
                      n.status === 'SENT' ? 'border-chart-2/40 text-chart-2' : n.status === 'FAILED' ? 'border-destructive/40 text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {n.channel === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{n.body}</p>
                    {n.error && <p className="text-[11px] text-destructive">{n.error}</p>}
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(n.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

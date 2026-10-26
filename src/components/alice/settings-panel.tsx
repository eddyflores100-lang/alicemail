'use client'

// Pestaña Ajustes: motor on/off, ventana horaria, dominio de tracking, firma + guía DNS
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Loader2, Zap, ShieldCheck } from 'lucide-react'
import { api, SettingsDTO } from './types'
import { toast } from 'sonner'

export function SettingsPanel({ refreshKey }: { refreshKey: number }) {
  const [s, setS] = useState<SettingsDTO | null>(null)
  const [saving, setSaving] = useState(false)
  const [tickResult, setTickResult] = useState('')

  const load = useCallback(() => {
    api<SettingsDTO>('/api/settings').then(setS).catch((e) => toast.error(e.message))
  }, [])

  useEffect(load, [load, refreshKey])

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      const updated = await api<SettingsDTO>('/api/settings', { method: 'PATCH', body: JSON.stringify(s) })
      setS(updated)
      toast.success('Ajustes guardados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const forceTick = async () => {
    setTickResult('ejecutando…')
    try {
      const r = await api<{ ok: boolean; reason?: string }>('/api/worker/tick', { method: 'POST' })
      setTickResult(r.ok ? `✓ ${r.reason || 'ciclo completado'}` : `— ${r.reason || 'sin cambios'}`)
    } catch {
      setTickResult('error al ejecutar')
    }
  }

  if (!s) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" /> Motor de envío
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Motor activo</p>
              <p className="text-xs text-slate-400">Ciclo automático cada 45 s, IMAP cada ~5 min</p>
            </div>
            <Switch checked={s.workerEnabled} onCheckedChange={(v) => setS({ ...s, workerEnabled: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ventana: inicio (hora)</Label>
              <Input type="number" min={0} max={23} value={s.windowStart} onChange={(e) => setS({ ...s, windowStart: parseInt(e.target.value || '0', 10) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Ventana: fin (hora)</Label>
              <Input type="number" min={0} max={23} value={s.windowEnd} onChange={(e) => setS({ ...s, windowEnd: parseInt(e.target.value || '0', 10) })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tope global de correos de campaña por día</Label>
            <Input
              type="number"
              min={1}
              max={5000}
              value={s.dailyCapGlobal}
              onChange={(e) => setS({ ...s, dailyCapGlobal: parseInt(e.target.value || '200', 10) })}
              className="w-36"
            />
            <p className="text-xs text-slate-400">
              Techo diario de toda la plataforma (se ve en el Panel como «correos que puedes enviar hoy»). Con 10 buzones de Gmail gratis a 20/día quedaría en 200.
            </p>
          </div>
          <p className="text-xs text-slate-400">Los envíos solo ocurren dentro de la ventana horaria (simula horario humano y protege la reputación).</p>
          <div className="space-y-1.5">
            <Label>URL pública de tracking (opcional)</Label>
            <Input value={s.trackingUrl} onChange={(e) => setS({ ...s, trackingUrl: e.target.value })} placeholder="https://mail.techdigital.site" />
          </div>
          <p className="text-xs text-slate-400">Si expones AliceMail con dominio propio, ponlo aquí para activar píxel de apertura y links de baja funcionales.</p>
          <div className="space-y-1.5">
            <Label>Firma (se añade al final de cada correo de campaña)</Label>
            <Textarea rows={3} value={s.signature} onChange={(e) => setS({ ...s, signature: e.target.value })} placeholder={'María Pérez\nTechDigital · Data Specialist'} />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar ajustes'}
            </Button>
            <Button variant="outline" onClick={forceTick}>
              Forzar ciclo ahora
            </Button>
          </div>
          {tickResult && <p className="text-xs text-slate-500">{tickResult}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Entregabilidad — checklist DNS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>Para cada dominio de envío configura en Cloudflare antes de conectar buzones:</p>
          <ul className="space-y-2">
            <DnsItem record="SPF" desc="v=spf1 incluye el proveedor del buzón (p.ej. include:_spf.google.com) y tu SMTP propio" />
            <DnsItem record="DKIM" desc="CNAME/TXT que te da tu proveedor (Google Admin → Generar DKIM; M365 → portal Defender)" />
            <DnsItem record="DMARC" desc="_dmarc TXT: v=DMARC1; p=none; rua=mailto:tu@dominio (sube a p=quarantine cuando tengas histórico)" />
            <DnsItem record="MX/Tracking" desc="Si usas tracking con subdominio, un registro A/CNAME hacia esta VM" />
          </ul>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-600">Reglas de oro del sistema:</p>
            <p>· Cada buzón arranca en warmup: 3/día, +2 diarios, techo 25.</p>
            <p>· Con campaña activa el warmup baja a 5/día (protege reputación).</p>
            <p>· Un rebote detectado penaliza el buzón −25% durante 48 h.</p>
            <p>· 3 errores SMTP seguidos marcan el buzón en ERROR hasta que lo verifiques de nuevo.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DnsItem({ record, desc }: { record: string; desc: string }) {
  return (
    <li className="flex gap-2">
      <Badge variant="outline" className="shrink-0 border-emerald-300 text-emerald-700 mt-0.5">
        {record}
      </Badge>
      <span className="text-xs leading-relaxed">{desc}</span>
    </li>
  )
}

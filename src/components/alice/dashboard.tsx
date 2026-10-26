'use client'

// Página Resumen: KPIs, cuota diaria, pipeline, volumen y actividad
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { Send, Eye, Reply, AlertTriangle, Flame, MailX, Loader2, Gauge, Thermometer, Mail, Users } from 'lucide-react'
import { api, StatsDTO, MB_STATUS_LABEL, MB_STATUS_COLOR, STAGE_DOT, STAGE_LABEL_V3 } from './types'

export function Dashboard({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<StatsDTO | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const load = () =>
      api<StatsDTO>('/api/stats')
        .then((s) => {
          if (alive) {
            setStats(s)
            setError('')
          }
        })
        .catch((e) => alive && setError(e.message))
    load()
    const t = setInterval(load, 15_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [refreshKey])

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-6 text-sm text-destructive">No se pudo cargar el panel: {error}</CardContent>
      </Card>
    )
  }
  if (!stats) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const { kpis, series, recent, warmupProgress, quota, temperatures, stages, crm } = stats
  const quotaPct = quota.campaignCap > 0 ? Math.min(100, (quota.campaignSentToday / quota.campaignCap) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Cuota de envíos de hoy */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Gauge className="h-4 w-4 text-primary" />
              Correos que puedes enviar hoy
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> campaña: <strong className="tabular-nums text-foreground">{quota.campaignSentToday}/{quota.campaignCap}</strong></span>
              <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-chart-3" /> warmup: <strong className="tabular-nums text-foreground">{quota.warmupToday}</strong></span>
              <span className="flex items-center gap-1.5">
                <Thermometer className="h-3 w-3 text-primary" />
                calientes: <strong className="text-foreground">{temperatures.HOT || 0}</strong>
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Progress value={quotaPct} className="h-2.5 flex-1" />
            <span className="text-sm font-semibold tabular-nums shrink-0">{quota.campaignRemaining} restantes</span>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Tope global ajustable en Configuración; cada buzón respeta además su propio límite diario. {quota.byMailbox.length} buzón(es) activos suman hoy.
          </p>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<Send className="h-4 w-4 text-primary" />}
          label="Enviados hoy (campaña)"
          value={kpis.sentToday}
          sub={`+ ${kpis.warmupToday} de warmup`}
        />
        <KpiCard icon={<Eye className="h-4 w-4 text-chart-2" />} label="Tasa de apertura" value={`${kpis.openRate}%`} sub={`${kpis.openedToday} aperturas hoy`} />
        <KpiCard icon={<Reply className="h-4 w-4 text-chart-4" />} label="Respuestas totales" value={kpis.repliedTotal} sub={`${temperatures.HOT || 0} calientes · ${temperatures.WARM || 0} tibios`} />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4 text-chart-3" />}
          label="Rebotes"
          value={kpis.bouncesTotal}
          sub="penalizan el warmup 48 h"
        />
      </div>

      {/* Embudo CRM */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Pipeline comercial
            <Badge variant="outline" className="ml-1 text-[10px] font-normal text-muted-foreground">
              {crm.rulesEnabled} regla(s) de re-engagement · {crm.reengagedToday} re-activados hoy
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {['NUEVO', 'CONTACTADO', 'CALIENTE', 'TIBIO', 'FRIO', 'RECHAZADO', 'RECUPERADO'].map((st) => (
              <div key={st} className="rounded-md border bg-card p-2.5 text-center">
                <p className={`text-xl font-bold tabular-nums ${st === 'CALIENTE' ? 'text-primary' : st === 'RECUPERADO' ? 'text-chart-2' : 'text-foreground'}`}>
                  {stages[st] || 0}
                </p>
                <p className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[st]}`} />
                  {STAGE_LABEL_V3[st]}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            El asistente cataloga cada contacto según sus respuestas (caliente · tibio · frío · rechazado) y re-activa automáticamente a los que abren o se enfrían: re-envío, cambio de enfoque u otra promoción.
          </p>
        </CardContent>
      </Card>

      {/* Gráfico volumen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Volumen de envíos — últimos 14 días</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gWarm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5c26b" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#f5c26b" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="gCamp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff7a59" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#ff7a59" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#dfe3eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#516f90' }} />
                <YAxis tick={{ fontSize: 11, fill: '#516f90' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12, border: '1px solid #dfe3eb' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="warmup" name="Warmup" stroke="#f5c26b" fill="url(#gWarm)" strokeWidth={2} />
                <Area type="monotone" dataKey="campaign" name="Campaña" stroke="#ff7a59" fill="url(#gCamp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Progreso warmup */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Calentamiento por buzón</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-h-96 overflow-y-auto">
            {warmupProgress.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay buzones. Añádelos en <strong>Buzones de envío</strong>.</p>
            )}
            {warmupProgress.map((mb) => (
              <div key={mb.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium truncate">{mb.displayName}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {mb.penalty && <Badge variant="outline" className="text-[10px] border-chart-3/50 text-foreground">penalizado</Badge>}
                    <Badge className={`${MB_STATUS_COLOR[mb.status]} hover:${MB_STATUS_COLOR[mb.status]}`}>{MB_STATUS_LABEL[mb.status] || mb.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={mb.target > 0 ? Math.min(100, (mb.warmupToday / mb.target) * 100) : 0} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground tabular-nums w-28 text-right">
                    {mb.warmupToday}/{mb.target} · meta {mb.max}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{mb.email}</span>
                  <span>{mb.verified ? 'verificado' : 'sin verificar'}</span>
                </div>
                {mb.lastError && <p className="text-xs text-destructive truncate">{mb.lastError}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Actividad reciente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MailX className="h-4 w-4 text-muted-foreground" /> Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {recent.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Sin envíos todavía.</p>}
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id} className="py-2.5 flex items-start gap-3 text-sm">
                  <Badge variant="outline" className={`mt-0.5 shrink-0 text-[10px] ${r.kind === 'WARMUP' ? 'text-chart-3 border-chart-3/40' : 'text-primary border-primary/40'}`}>
                    {r.kind === 'WARMUP' ? 'warmup' : 'campaña'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.from} → {r.to}
                      {r.status === 'FAILED' && <span className="text-destructive"> · falló</span>}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(r.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      </CardContent>
    </Card>
  )
}

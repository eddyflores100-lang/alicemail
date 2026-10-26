'use client'

// Pestaña Panel: KPIs, gráfico de volumen, progreso warmup y actividad
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
      <Card className="border-red-200">
        <CardContent className="p-6 text-sm text-red-600">No se pudo cargar el panel: {error}</CardContent>
      </Card>
    )
  }
  if (!stats) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const { kpis, series, recent, warmupProgress, quota, temperatures, stages, crm } = stats

  return (
    <div className="space-y-6">
      {/* Cuota de envíos de hoy */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-white">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Gauge className="h-4 w-4 text-emerald-600" />
              Correos que puedes enviar hoy
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> campaña: <strong className="tabular-nums">{quota.campaignSentToday}/{quota.campaignCap}</strong></span>
              <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-amber-500" /> warmup: <strong className="tabular-nums">{quota.warmupToday}</strong></span>
              <span className="flex items-center gap-1.5">
                <Thermometer className="h-3 w-3 text-rose-500" />
                calientes: <strong>{temperatures.HOT || 0}</strong>
              </span>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-3 flex-1 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${quota.campaignRemaining === 0 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, quota.campaignCap > 0 ? (quota.campaignSentToday / quota.campaignCap) * 100 : 0)}%` }}
              />
            </div>
            <span className="text-sm font-bold text-slate-800 tabular-nums shrink-0">
              {quota.campaignRemaining} restantes
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Tope global ajustable en Ajustes; cada buzón respeta además su propio límite diario. {quota.byMailbox.length} buzón(es) activos suman hoy.
          </p>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<Send className="h-4 w-4 text-emerald-600" />}
          label="Enviados hoy (campaña)"
          value={kpis.sentToday}
          sub={`+ ${kpis.warmupToday} de warmup`}
        />
        <KpiCard icon={<Eye className="h-4 w-4 text-teal-600" />} label="Tasa de apertura" value={`${kpis.openRate}%`} sub={`${kpis.openedToday} aperturas hoy`} />
        <KpiCard icon={<Reply className="h-4 w-4 text-emerald-700" />} label="Respuestas totales" value={kpis.repliedTotal} sub={`${temperatures.HOT || 0} calientes · ${temperatures.WARM || 0} tibios`} />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
          label="Rebotes"
          value={kpis.bouncesTotal}
          sub="penalizan warmup 48h"
        />
      </div>

      {/* Embudo CRM */}
      <Card className="border-violet-100 bg-gradient-to-r from-violet-50/60 to-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-500" /> Pipeline CRM
            <Badge variant="outline" className="ml-1 text-[10px] font-normal text-slate-500">
              {crm.rulesEnabled} regla(s) de re-engagement activas · {crm.reengagedToday} re-activados hoy
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {['NUEVO', 'CONTACTADO', 'CALIENTE', 'TIBIO', 'FRIO', 'RECHAZADO', 'RECUPERADO'].map((st) => (
              <div key={st} className="rounded-lg border bg-white p-2.5 text-center">
                <p className={`text-xl font-bold tabular-nums ${st === 'CALIENTE' ? 'text-rose-600' : st === 'RECUPERADO' ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {stages[st] || 0}
                </p>
                <p className="flex items-center justify-center gap-1 text-[10px] text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[st]}`} />
                  {STAGE_LABEL_V3[st]}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            El agente cataloga cada lead según sus respuestas (caliente · tibio · frío · rechazado) y re-activa automáticamente a los que abren o se enfrían: re-envío, cambio de enfoque u otra promoción.
          </p>
        </CardContent>
      </Card>

      {/* Gráfico volumen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-500" /> Volumen de envíos — últimos 14 días
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gWarm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gCamp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="warmup" name="Warmup" stroke="#f59e0b" fill="url(#gWarm)" strokeWidth={2} />
                <Area type="monotone" dataKey="campaign" name="Campaña" stroke="#10b981" fill="url(#gCamp)" strokeWidth={2} />
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
              <p className="text-sm text-slate-400 py-6 text-center">Aún no hay buzones. Añádelos en la sección <strong>Buzones</strong>.</p>
            )}
            {warmupProgress.map((mb) => (
              <div key={mb.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium truncate">{mb.displayName}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {mb.penalty && <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">penalizado</Badge>}
                    <Badge className={`${MB_STATUS_COLOR[mb.status]} hover:${MB_STATUS_COLOR[mb.status]}`}>{MB_STATUS_LABEL[mb.status] || mb.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={mb.target > 0 ? Math.min(100, (mb.warmupToday / mb.target) * 100) : 0} className="h-2 flex-1" />
                  <span className="text-xs text-slate-500 tabular-nums w-28 text-right">
                    {mb.warmupToday}/{mb.target} · meta {mb.max}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="truncate">{mb.email}</span>
                  <span>{mb.verified ? 'verificado' : 'sin verificar'}</span>
                </div>
                {mb.lastError && <p className="text-xs text-red-500 truncate">⚠ {mb.lastError}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Actividad reciente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MailX className="h-4 w-4 text-slate-500" /> Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {recent.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Sin envíos todavía.</p>}
            <ul className="divide-y divide-slate-100">
              {recent.map((r) => (
                <li key={r.id} className="py-2.5 flex items-start gap-3 text-sm">
                  <Badge variant="outline" className={`mt-0.5 shrink-0 ${r.kind === 'WARMUP' ? 'text-amber-600 border-amber-200' : 'text-emerald-600 border-emerald-200'}`}>
                    {r.kind === 'WARMUP' ? 'warmup' : 'campaña'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.subject}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {r.from} → {r.to}
                      {r.status === 'FAILED' && <span className="text-red-500"> · falló</span>}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{new Date(r.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
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
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-bold text-slate-800 tabular-nums">{value}</div>
        <div className="text-xs text-slate-400 mt-1">{sub}</div>
      </CardContent>
    </Card>
  )
}

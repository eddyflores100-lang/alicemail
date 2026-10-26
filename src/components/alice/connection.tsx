'use client'

// Página Conexión: dominio alicelabs.space, DNS, túnel Cloudflare y estado de seguridad
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Globe, Loader2, ShieldCheck, Lock, Server, ExternalLink, Check, Copy, Plug } from 'lucide-react'
import { api, SettingsDTO } from './types'
import { toast } from 'sonner'

const DNS_RECORDS: { tipo: string; nombre: string; valor: string; para: string }[] = [
  { tipo: 'CNAME', nombre: 'app', valor: '<ID-TUNNEL>.cfargotunnel.com', para: 'Aplicación (este panel) vía túnel' },
  { tipo: 'CNAME', nombre: 'mail', valor: '<ID-TUNNEL>.cfargotunnel.com', para: 'Píxel de apertura y enlaces de baja' },
  { tipo: 'TXT', nombre: '@ (SPF)', valor: 'v=spf1 include:_spf.google.com -all', para: 'Autoriza los servidores que envían por ti' },
  { tipo: 'CNAME', nombre: 'google._domainkey', valor: '(lo genera Google Admin / tu SMTP)', para: 'Firma DKIM de cada correo' },
  { tipo: 'TXT', nombre: '_dmarc', valor: 'v=DMARC1; p=none; rua=mailto:tu@alicelabs.space', para: 'Política DMARC del dominio' },
]

const TUNNEL_STEPS: { title: string; cmd?: string; note?: string }[] = [
  { title: '1 · Instala cloudflared en la VM (una sola vez)', cmd: 'sudo dnf install -y cloudflared  # o descarga el binario ARM64 desde GitHub' },
  { title: '2 · Autentica y crea el túnel', cmd: 'cloudflared tunnel login && cloudflared tunnel create alicemail' },
  { title: '3 · Configura los ingresos (ingress)', note: '~/.cloudflared/config.yml → app.alicelabs.space y mail.alicelabs.space hacia http://localhost:3000' },
  { title: '4 · Crea las rutas DNS y arranca como servicio', cmd: 'cloudflared tunnel route dns alicemail app.alicelabs.space && cloudflared tunnel route dns alicemail mail.alicelabs.space && sudo systemctl enable --now cloudflared' },
]

export function Connection({ refreshKey }: { refreshKey: number }) {
  const [s, setS] = useState<SettingsDTO | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(() => {
    api<SettingsDTO>('/api/settings').then(setS).catch((e) => toast.error(e.message))
  }, [])

  useEffect(load, [load, refreshKey])

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ appUrl: s.appUrl, trackingUrl: s.trackingUrl }) })
      toast.success('Dominios guardados')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  if (!s) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* URLs del ecosistema */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Dominio del ecosistema — alicelabs.space
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            La aplicación vive en tu VM de Oracle (sin puertos abiertos) y se publica de forma segura a través de
            Cloudflare Tunnel con TLS automático. Configura estos dos subdominios y el tracking de aperturas y las
            bajas funcionarán de inmediato.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Aplicación (panel)</Label>
              <Input value={s.appUrl} onChange={(e) => setS({ ...s, appUrl: e.target.value })} placeholder="https://app.alicelabs.space" />
            </div>
            <div className="space-y-1.5">
              <Label>Tracking (aperturas y bajas)</Label>
              <Input value={s.trackingUrl} onChange={(e) => setS({ ...s, trackingUrl: e.target.value })} placeholder="https://mail.alicelabs.space" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar dominios'}
            </Button>
            <a
              href="https://dash.cloudflare.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Abrir Cloudflare <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* DNS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Registros DNS en Cloudflare</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {DNS_RECORDS.map((r) => (
                <div key={r.nombre} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px] shrink-0">{r.tipo}</Badge>
                    <span className="font-mono text-xs font-medium">{r.nombre}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground hidden sm:block">{r.para}</span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{r.valor}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Sustituye <code className="font-mono">&lt;ID-TUNNEL&gt;</code> por el UUID que imprime
              <code className="font-mono"> cloudflared tunnel create</code>. Los registros SPF/DKIM/DMARC van en el
              dominio que uses como remitente.
            </p>
          </CardContent>
        </Card>

        {/* Túnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" /> Cloudflare Tunnel — publicación sin puertos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Conecta la VM a alicelabs.space sin abrir un solo puerto: cloudflared mantiene un túnel saliente y
              Cloudflare enruta el tráfico HTTPS hacia <code className="font-mono">localhost:3000</code>.
            </p>
            {TUNNEL_STEPS.map((step) => (
              <div key={step.title} className="rounded-lg border p-3">
                <p className="text-xs font-medium">{step.title}</p>
                {step.cmd && (
                  <div className="mt-1.5 flex items-start gap-2">
                    <code className="flex-1 block break-all rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed">{step.cmd}</code>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copy(step.title, step.cmd!)} aria-label="Copiar comando">
                      {copied === step.title ? <Check className="h-3 w-3 text-chart-2" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
                {step.note && <p className="mt-1.5 text-[11px] text-muted-foreground">{step.note}</p>}
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Guía completa en <code className="font-mono">docs/ALICELABS-SPACE.md</code> del repositorio.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Seguridad */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-chart-2" /> Estado de seguridad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SecItem icon={<Lock className="h-3.5 w-3.5" />} title="Cifrado en reposo" desc="Contraseñas y tokens con AES-256-GCM" />
            <SecItem icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Acceso con contraseña" desc="scrypt + cookie de sesión firmada" />
            <SecItem icon={<Server className="h-3.5 w-3.5" />} title="Cero puertos abiertos" desc="Solo túnel saliente hacia Cloudflare" />
            <SecItem icon={<Plug className="h-3.5 w-3.5" />} title="MCP autenticado" desc="Bearer token + límite 120/min" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SecItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">{icon} {title}</p>
      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  )
}

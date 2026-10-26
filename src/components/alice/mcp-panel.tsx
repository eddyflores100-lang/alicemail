'use client'

// Página MCP: endpoint, token oculto (revelable) y herramientas expuestas
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plug, Copy, Check, KeyRound, Terminal, Eye, RefreshCw, ShieldCheck } from 'lucide-react'
import { api, McpDTO } from './types'
import { toast } from 'sonner'

export function McpPanel({ refreshKey }: { refreshKey: number }) {
  const [info, setInfo] = useState<McpDTO | null>(null)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [loadingToken, setLoadingToken] = useState(false)

  const load = useCallback(() => {
    api<McpDTO>('/api/mcp').then(setInfo).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const raf = requestAnimationFrame(() => setOrigin(window.location.origin))
    return () => cancelAnimationFrame(raf)
  }, [load, refreshKey])

  const revealToken = async () => {
    setLoadingToken(true)
    try {
      const r = await api<{ value: string }>('/api/settings/reveal', { method: 'POST', body: JSON.stringify({ key: 'mcpToken' }) })
      setToken(r.value)
    } catch {
      toast.error('No se pudo obtener el token')
    } finally {
      setLoadingToken(false)
    }
  }

  const rotateToken = async () => {
    setLoadingToken(true)
    try {
      const r = await api<{ token: string }>('/api/mcp/rotate', { method: 'POST' })
      setToken(r.token)
      toast.success('Token regenerado — actualiza tus clientes MCP')
    } catch {
      toast.error('No se pudo regenerar el token')
    } finally {
      setLoadingToken(false)
    }
  }

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      toast.success('Copiado')
      setTimeout(() => setCopied(''), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  if (!info) return null

  const mcpUrl = `${origin}/api/mcp`
  const cfg = token
    ? JSON.stringify(
        {
          mcpServers: {
            alicemail: {
              command: 'npx',
              args: ['-y', 'mcp-remote', mcpUrl, '--header', `Authorization: Bearer ${token}`],
            },
          },
        },
        null,
        2
      )
    : ''

  const curl = token
    ? `curl -X POST ${mcpUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_status","arguments":{}}}'`
    : ''

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" /> Servidor MCP de AliceMail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            AliceMail expone un servidor <strong className="text-foreground">MCP (Model Context Protocol)</strong> sobre HTTP
            JSON-RPC 2.0. Conéctalo desde Claude Desktop, Cursor u otro cliente MCP para consultar y controlar la plataforma:
            estado, contactos calientes, bandeja, pausar campañas, enviar respuestas.
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            <SecBadge icon={<KeyRound className="h-3.5 w-3.5" />} label="Bearer token obligatorio" />
            <SecBadge icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Límite 120 peticiones/min" />
            <SecBadge icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Token cifrado en reposo" />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Endpoint</span>
            <div className="flex gap-2">
              <Input readOnly value={mcpUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy('url', mcpUrl)} aria-label="Copiar endpoint">
                {copied === 'url' ? <Check className="h-4 w-4 text-chart-2" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Token Bearer</span>
            <div className="flex gap-2">
              <Input readOnly value={token || '••••••••••••••••••••••••••••••••'} className="font-mono text-xs" type={token ? 'text' : 'password'} />
              {!token ? (
                <Button variant="outline" onClick={revealToken} disabled={loadingToken}>
                  <Eye className="h-4 w-4" /> Mostrar
                </Button>
              ) : (
                <Button variant="outline" size="icon" onClick={() => copy('token', token)} aria-label="Copiar token">
                  {copied === 'token' ? <Check className="h-4 w-4 text-chart-2" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={rotateToken} disabled={loadingToken} title="Regenerar token" aria-label="Regenerar token">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              El token no se muestra por defecto y está cifrado en la base de datos. Si lo regeneras, los clientes
              anteriores quedan invalidados. En la VM, el endpoint local es <code className="font-mono">http://localhost:3000/api/mcp</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      {token ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" /> Configuración para Claude Desktop
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Pega esto en <code className="font-mono">claude_desktop_config.json</code> (requiere Node en tu equipo):
              </p>
              <pre className="rounded-lg bg-foreground text-background text-[11px] leading-relaxed p-3 overflow-x-auto">{cfg}</pre>
              <Button size="sm" variant="outline" onClick={() => copy('claude', cfg)}>
                {copied === 'claude' ? <Check className="h-3.5 w-3.5 mr-1 text-chart-2" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                Copiar JSON
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Prueba rápida con curl</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <pre className="rounded-lg bg-foreground text-background text-[11px] leading-relaxed p-3 overflow-x-auto">{curl}</pre>
              <Button size="sm" variant="outline" onClick={() => copy('curl', curl)}>
                {copied === 'curl' ? <Check className="h-3.5 w-3.5 mr-1 text-chart-2" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                Copiar curl
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground">
            Muestra el token arriba para generar la configuración de Claude Desktop y el comando curl de prueba.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Herramientas expuestas ({info.tools.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 md:grid-cols-2">
            {info.tools.map((t) => (
              <li key={t.name} className="rounded-lg border p-3">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {t.name}
                </Badge>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{t.description}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function SecBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <span className="text-chart-2">{icon}</span>
      {label}
    </div>
  )
}

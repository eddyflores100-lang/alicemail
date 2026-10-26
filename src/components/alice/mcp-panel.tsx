'use client'

// Página MCP: endpoint, token y herramientas expuestas a clientes externos
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plug, Copy, Check, KeyRound, Terminal } from 'lucide-react'
import { api, McpDTO } from './types'
import { toast } from 'sonner'

export function McpPanel({ refreshKey }: { refreshKey: number }) {
  const [info, setInfo] = useState<McpDTO | null>(null)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState('')

  const load = useCallback(() => {
    api<McpDTO>('/api/mcp').then(setInfo).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const raf = requestAnimationFrame(() => setOrigin(window.location.origin))
    return () => cancelAnimationFrame(raf)
  }, [load, refreshKey])

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
  const curl = `curl -X POST ${mcpUrl} \\
  -H "Authorization: Bearer ${info.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_status","arguments":{}}}'`

  const claudeCfg = JSON.stringify(
    {
      mcpServers: {
        alicemail: {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcpUrl, '--header', `Authorization: Bearer ${info.token}`],
        },
      },
    },
    null,
    2
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="h-4 w-4 text-emerald-600" /> Servidor MCP de AliceMail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            AliceMail expone un servidor <strong>MCP (Model Context Protocol)</strong> sobre HTTP JSON-RPC 2.0. Conéctalo desde
            Claude Desktop, Cursor u otro cliente MCP para consultar y controlar la plataforma con lenguaje natural: estado,
            leads calientes, bandeja, pausar campañas, enviar respuestas… Aquí también lo usan otros agentes.
          </p>

          <div className="space-y-1.5">
            <Label2>Endpoint</Label2>
            <div className="flex gap-2">
              <Input readOnly value={mcpUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy('url', mcpUrl)} aria-label="Copiar endpoint">
                {copied === 'url' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label2 className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-amber-500" /> Token Bearer
            </Label2>
            <div className="flex gap-2">
              <Input readOnly value={info.token} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy('token', info.token)} aria-label="Copiar token">
                {copied === 'token' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              En la VM, el endpoint es <code className="font-mono">http://localhost:3000/api/mcp</code> (acceso local por túnel SSH; nunca lo expongas sin token).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4 text-slate-500" /> Configuración para Claude Desktop
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-slate-500">
              Pega esto en <code className="font-mono">claude_desktop_config.json</code> (requiere Node en tu equipo):
            </p>
            <pre className="rounded-lg bg-slate-900 text-slate-100 text-[11px] leading-relaxed p-3 overflow-x-auto">{claudeCfg}</pre>
            <Button size="sm" variant="outline" onClick={() => copy('claude', claudeCfg)}>
              {copied === 'claude' ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              Copiar JSON
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Prueba rápida con curl</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <pre className="rounded-lg bg-slate-900 text-slate-100 text-[11px] leading-relaxed p-3 overflow-x-auto">{curl}</pre>
            <Button size="sm" variant="outline" onClick={() => copy('curl', curl)}>
              {copied === 'curl' ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              Copiar curl
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Herramientas expuestas ({info.tools.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 md:grid-cols-2">
            {info.tools.map((t) => (
              <li key={t.name} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] border-emerald-300 text-emerald-700">
                    {t.name}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{t.description}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function Label2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-xs font-medium text-slate-600 ${className}`}>{children}</span>
}

import { NextRequest, NextResponse } from 'next/server'
import { handleMcpRpc, mcpServerInfo, verifyMcpToken } from '@/lib/mcp'
import { logEvent } from '@/lib/agent'
import { isAuthenticated } from '@/lib/auth'

/**
 * Discovery (GET): SOLO para sesiones autenticadas (el panel) o peticiones
 * con Bearer válido. Nunca expone el token a visitantes anónimos.
 */
export async function GET(req: NextRequest) {
  const { ok } = await verifyMcpToken(req)
  if (!(await isAuthenticated()) && !ok) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const info = await mcpServerInfo()
  return NextResponse.json({
    server: 'alicemail-mcp',
    version: '3.1.0',
    protocol: '2024-11-05',
    transport: 'HTTP JSON-RPC 2.0',
    endpoint: info.endpoint,
    token: info.token,
    security: { transport: 'Bearer token', rateLimit: '120/min', encryptedAtRest: true },
    tools: info.tools.map((t) => ({ name: t.name, description: t.description })),
  })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, { status: 400 })
  }
  const { ok: tokenOk, limited } = await verifyMcpToken(req)
  if (limited) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32005, message: 'Límite de peticiones excedido (120/min)' } },
      { status: 429 }
    )
  }
  const res = await handleMcpRpc(body as Parameters<typeof handleMcpRpc>[0], tokenOk)
  const method = String(body.method || '')
  if (method === 'tools/call') {
    const name = ((body.params as Record<string, unknown>) || {}).name
    await logEvent('SYSTEM', 'INFO', `Llamada MCP: ${String(name)}`, { via: 'mcp' })
  }
  return NextResponse.json(res)
}

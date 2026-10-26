import { NextRequest, NextResponse } from 'next/server'
import { handleMcpRpc, mcpServerInfo, verifyMcpToken } from '@/lib/mcp'
import { logEvent } from '@/lib/agent'

export async function GET() {
  // Discovery para humanos: endpoint, token y herramientas disponibles
  const info = await mcpServerInfo()
  return NextResponse.json({
    server: 'alicemail-mcp',
    version: '2.0.0',
    protocol: '2024-11-05',
    transport: 'HTTP JSON-RPC 2.0',
    endpoint: info.endpoint,
    token: info.token,
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
  const { ok: tokenOk } = await verifyMcpToken(req)
  const res = await handleMcpRpc(body as Parameters<typeof handleMcpRpc>[0], tokenOk)
  const method = String(body.method || '')
  if (method === 'tools/call') {
    const name = ((body.params as Record<string, unknown>) || {}).name
    await logEvent('SYSTEM', 'INFO', `Llamada MCP: ${String(name)}`, { via: 'mcp' })
  }
  return NextResponse.json(res)
}

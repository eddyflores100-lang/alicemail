import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { saveSettings, ensureMcpToken } from '@/lib/settings'
import { randomToken } from '@/lib/crypto'

/** Regenera el token MCP (requiere sesión). El anterior deja de funcionar. */
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const token = `amx_${randomToken(18)}`
  await saveSettings({ mcpToken: token })
  const current = await ensureMcpToken()
  return NextResponse.json({ ok: true, token: current })
}

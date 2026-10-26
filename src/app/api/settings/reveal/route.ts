import { NextRequest, NextResponse } from 'next/server'
import { getSettings, AppSettings } from '@/lib/settings'
import { isAuthenticated } from '@/lib/auth'

type RevealKey = 'notifyTelegramToken' | 'notifyWaToken' | 'aiApiKey' | 'mcpToken'
const ALLOWED: RevealKey[] = ['notifyTelegramToken', 'notifyWaToken', 'aiApiKey', 'mcpToken']

/**
 * Devuelve UN secreto descifrado para copiarlo (requiere sesión).
 * Los secretos nunca viajan en respuestas de listado: cifrados en la BD.
 */
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const { key } = (await req.json().catch(() => ({ key: '' }))) as { key: string }
  if (!ALLOWED.includes(key as RevealKey)) {
    return NextResponse.json({ error: 'Clave no permitida' }, { status: 400 })
  }
  const s = await getSettings()
  const value = s[key as keyof AppSettings]
  return NextResponse.json({ value: value || '' })
}

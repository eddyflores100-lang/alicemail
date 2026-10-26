import { NextRequest, NextResponse } from 'next/server'
import { createPassword, hasPassword, startSession } from '@/lib/auth'

/** Primer arranque: crea la contraseña de administrador (solo si no existe) */
export async function POST(req: NextRequest) {
  if (await hasPassword()) {
    return NextResponse.json({ error: 'La contraseña ya está configurada' }, { status: 403 })
  }
  const { password } = await req.json().catch(() => ({ password: '' }))
  try {
    await createPassword(String(password || ''))
    await startSession()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}

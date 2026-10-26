import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated, changePassword } from '@/lib/auth'

/** Cambio de contraseña (requiere sesión iniciada) */
export async function PATCH(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const { current, next } = await req.json().catch(() => ({ current: '', next: '' }))
  try {
    await changePassword(String(current || ''), String(next || ''))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}

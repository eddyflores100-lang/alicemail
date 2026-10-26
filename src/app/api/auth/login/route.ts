import { NextRequest, NextResponse } from 'next/server'
import { checkPassword, hasPassword, startSession } from '@/lib/auth'

// Limitador simple en memoria: 8 intentos por IP y minuto
const attempts = new Map<string, { n: number; reset: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const a = attempts.get(ip)
  if (!a || a.reset < now) {
    attempts.set(ip, { n: 1, reset: now + 60_000 })
    return false
  }
  a.n += 1
  return a.n > 8
}

export async function POST(req: NextRequest) {
  if (!await hasPassword()) {
    return NextResponse.json({ error: 'Primero crea la contraseña de administrador' }, { status: 400 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Demasiados intentos — espera un minuto' }, { status: 429 })
  }
  const { password } = await req.json().catch(() => ({ password: '' }))
  if (!(await checkPassword(String(password || '')))) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }
  await startSession()
  return NextResponse.json({ ok: true })
}

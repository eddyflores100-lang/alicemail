import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encryptSecret } from '@/lib/crypto'
import { isAuthenticated } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  const allowed = [
    'displayName', 'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass',
    'imapHost', 'imapPort', 'imapSecure', 'imapUser', 'imapPass',
    'status', 'campaignDailyLimit', 'warmupStart', 'warmupMax', 'warmupRamp',
  ]
  for (const k of allowed) {
    if (body[k] !== undefined && body[k] !== '') data[k] = body[k]
  }
  // Contraseñas nuevas: se cifran antes de tocar la base de datos
  if (data.smtpPass) data.smtpPass = encryptSecret(String(data.smtpPass))
  if (data.imapPass) data.imapPass = encryptSecret(String(data.imapPass))
  if (body.restartWarmup) {
    data.warmupStartedAt = new Date()
    data.penaltyUntil = null
  }
  if (body.clearError) {
    data.consecutiveErrors = 0
    data.lastError = null
  }
  try {
    const mb = await db.mailbox.update({ where: { id }, data })
    const { smtpPass: _s, imapPass: _i, ...rest } = mb
    return NextResponse.json(rest)
  } catch {
    return NextResponse.json({ error: 'Buzón no encontrado' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const { id } = await params
  await db.mailbox.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

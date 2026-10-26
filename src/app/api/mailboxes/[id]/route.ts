import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  const allowed = [
    'displayName', 'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass',
    'imapHost', 'imapPort', 'imapSecure', 'imapUser', 'imapPass',
    'status', 'campaignDailyLimit', 'warmupStart', 'warmupMax', 'warmupRamp',
  ]
  for (const k of allowed) {
    if (body[k] !== undefined) data[k] = body[k]
  }
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
  const { id } = await params
  await db.mailbox.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

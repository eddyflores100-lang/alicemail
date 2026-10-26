import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PROVIDER_PRESETS } from '@/lib/mailer'
import { encryptSecret } from '@/lib/crypto'
import { isAuthenticated } from '@/lib/auth'

function publicMailbox(mb: { smtpPass: string; imapPass: string } & Record<string, unknown>) {
  const { smtpPass, imapPass, ...rest } = mb
  return { ...rest, hasSmtpPass: !!smtpPass, hasImapPass: !!imapPass }
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const mailboxes = await db.mailbox.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json(mailboxes.map(publicMailbox))
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const body = await req.json()
  const {
    email, displayName, provider = 'SMTP',
    smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass,
    imapHost, imapPort, imapSecure, imapUser, imapPass,
    campaignDailyLimit, warmupStart, warmupMax, warmupRamp,
  } = body

  if (!email || !displayName) {
    return NextResponse.json({ error: 'Email y nombre son obligatorios' }, { status: 400 })
  }
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.SMTP
  try {
    const mb = await db.mailbox.create({
      data: {
        email: String(email).toLowerCase().trim(),
        displayName,
        provider,
        smtpHost: smtpHost ?? preset.smtpHost,
        smtpPort: Number(smtpPort ?? preset.smtpPort),
        smtpSecure: smtpSecure ?? preset.smtpSecure,
        smtpUser: smtpUser || email,
        smtpPass: encryptSecret(smtpPass || ''),
        imapHost: imapHost ?? preset.imapHost,
        imapPort: Number(imapPort ?? preset.imapPort),
        imapSecure: imapSecure ?? preset.imapSecure,
        imapUser: imapUser || email,
        imapPass: encryptSecret(imapPass || smtpPass || ''),
        campaignDailyLimit: Number(campaignDailyLimit ?? 20),
        warmupStart: Number(warmupStart ?? 3),
        warmupMax: Number(warmupMax ?? 25),
        warmupRamp: Number(warmupRamp ?? 2),
      },
    })
    return NextResponse.json(publicMailbox(mb), { status: 201 })
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('Unique') ? 'Ese buzón ya existe' : 'Error creando buzón'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await db.campaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

  const body = await req.json()
  const { leadIds, all = false, mailboxIds = [] } = body as {
    leadIds?: string[]
    all?: boolean
    mailboxIds?: string[]
  }

  // buzones verificados disponibles (rota entre ellos)
  const mailboxes = await db.mailbox.findMany({
    where: mailboxIds.length
      ? { id: { in: mailboxIds }, verified: true }
      : { verified: true, status: { in: ['WARMUP', 'ACTIVE'] } },
  })
  if (!mailboxes.length) {
    return NextResponse.json({ error: 'No hay buzones verificados. Verifica al menos uno en la pestaña Buzones.' }, { status: 400 })
  }

  const leads = all
    ? await db.lead.findMany({ where: { status: { in: ['NEW', 'ACTIVE'] } }, select: { id: true } })
    : await db.lead.findMany({ where: { id: { in: leadIds || [] } }, select: { id: true } })
  if (!leads.length) return NextResponse.json({ error: 'No hay leads elegibles (nuevos o activos)' }, { status: 400 })

  let enrolled = 0
  let skipped = 0
  let rotation = 0
  for (const lead of leads) {
    try {
      const existing = await db.enrollment.findUnique({
        where: { campaignId_leadId: { campaignId: id, leadId: lead.id } },
      })
      if (existing) {
        skipped++
        continue
      }
      const mailbox = mailboxes[rotation % mailboxes.length]
      rotation++
      await db.enrollment.create({
        data: {
          campaignId: id,
          leadId: lead.id,
          mailboxId: mailbox.id,
          status: 'QUEUED',
          nextSendAt: new Date(Date.now() + Math.floor(Math.random() * 20) * 60_000), // escalonado 0-20 min
        },
      })
      enrolled++
    } catch {
      skipped++
    }
  }
  return NextResponse.json({ enrolled, skipped, mailboxes: mailboxes.length })
}

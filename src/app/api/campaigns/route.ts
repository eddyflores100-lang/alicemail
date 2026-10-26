import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { enrollments: true, steps: true } } },
  })
  const result = await Promise.all(
    campaigns.map(async (c) => {
      const [sent, replied] = await Promise.all([
        db.send.count({ where: { campaignId: c.id, kind: 'CAMPAIGN' } }),
        db.enrollment.count({ where: { campaignId: c.id, status: 'REPLIED' } }),
      ])
      const { steps: _s, enrollments: _e, ...rest } = c
      return { ...rest, stepCount: c._count.steps, enrollmentCount: c._count.enrollments, sent, replied }
    })
  )
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, fromName, dailyTarget = 200, trackOpens = true, steps } = body
  if (!name || !fromName || !Array.isArray(steps) || !steps.length) {
    return NextResponse.json({ error: 'Faltan nombre, remitente o pasos' }, { status: 400 })
  }
  const normalized = (steps as { subject: string; body: string; delayDays?: number }[])
    .filter((s) => s.subject && s.body)
    .map((s, i) => ({
      stepNumber: i + 1,
      delayDays: i === 0 ? 0 : Math.max(1, Number(s.delayDays ?? 3)),
      subject: s.subject,
      body: s.body,
    }))
  if (!normalized.length) {
    return NextResponse.json({ error: 'Se necesita al menos un paso con asunto y cuerpo' }, { status: 400 })
  }
  const campaign = await db.campaign.create({
    data: {
      name,
      fromName,
      dailyTarget: Number(dailyTarget),
      trackOpens: Boolean(trackOpens),
      steps: { create: normalized },
    },
    include: { steps: true },
  })
  return NextResponse.json(campaign, { status: 201 })
}

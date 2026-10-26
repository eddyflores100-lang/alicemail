import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      enrollments: {
        include: { lead: { select: { email: true, name: true, company: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      },
    },
  })
  if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  return NextResponse.json(campaign)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.status) data.status = body.status
  if (body.name) data.name = body.name
  if (body.fromName) data.fromName = body.fromName
  if (body.dailyTarget !== undefined) data.dailyTarget = Number(body.dailyTarget)
  if (body.trackOpens !== undefined) data.trackOpens = Boolean(body.trackOpens)
  if (body.resetEnrollments) {
    // reinicia la secuencia para leads no respondidos
    await db.enrollment.updateMany({
      where: { campaignId: id, status: { in: ['QUEUED', 'IN_PROGRESS'] } },
      data: { currentStep: 0, nextSendAt: new Date() },
    })
  }
  try {
    const campaign = await db.campaign.update({ where: { id }, data })
    return NextResponse.json(campaign)
  } catch {
    return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.campaign.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { setLeadStage, logLeadEvent, STAGES, type Stage } from '@/lib/crm'

const STATUSES = ['NEW', 'ACTIVE', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'PAUSED']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      events: { orderBy: { createdAt: 'desc' }, take: 60 },
      enrollments: { include: { campaign: true }, orderBy: { createdAt: 'desc' } },
      sends: { orderBy: { sentAt: 'desc' }, take: 20 },
    },
  })
  if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  const replies = await db.inboxMessage.findMany({
    where: { fromEmail: lead.email, isReply: true },
    orderBy: { receivedAt: 'desc' },
    take: 10,
  })
  return NextResponse.json({ lead, replies })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const current = await db.lead.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  if (body.stage) {
    if (!STAGES.includes(body.stage)) {
      return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })
    }
    const updated = await setLeadStage(current, body.stage as Stage, {
      source: body.stageSource || 'manual (CRM)',
      detail: body.stageDetail,
    })
    return NextResponse.json(updated)
  }

  if (body.status && !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }
  try {
    const lead = await db.lead.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.company !== undefined ? { company: body.company } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
      },
    })
    if (body.note) {
      await logLeadEvent(id, 'NOTE', String(body.note).slice(0, 280))
    }
    return NextResponse.json(lead)
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.lead.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

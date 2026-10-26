import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Registro de automatización CRM: re-engagements, cambios de enfoque, promociones */
export async function GET() {
  const events = await db.leadEvent.findMany({
    where: { type: { in: ['REENGAGE', 'ANGLE', 'PROMO', 'STAGE'] } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { lead: { select: { email: true, name: true } } },
  })
  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      detail: e.detail,
      leadEmail: e.lead.email,
      leadName: e.lead.name,
      createdAt: e.createdAt,
    })),
  })
}

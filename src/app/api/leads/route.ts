import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHash, randomUUID } from 'crypto'
import { STAGES } from '@/lib/crm'
import { logLeadEvent } from '@/lib/crm'

function makeToken(email: string): string {
  return createHash('sha256').update(email + randomUUID()).digest('hex').slice(0, 24)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const search = (url.searchParams.get('q') || '').toLowerCase()
  const status = url.searchParams.get('status') || ''
  const stage = url.searchParams.get('stage') || ''
  const temperature = url.searchParams.get('temperature') || ''
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)))

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (stage) where.stage = stage
  if (temperature) where.temperature = temperature
  if (search) {
    where.OR = [
      { email: { contains: search } },
      { name: { contains: search } },
      { company: { contains: search } },
    ]
  }
  const [total, leads, stageGroups] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      orderBy: [{ lastContactedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.lead.groupBy({ by: ['stage'], _count: true }),
  ])
  const stageCounts: Record<string, number> = {}
  for (const st of STAGES) stageCounts[st] = 0
  for (const g of stageGroups) stageCounts[g.stage] = g._count
  return NextResponse.json({ total, page, pageSize, stageCounts, leads })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const email = String(body.email || '').toLowerCase().trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }
  try {
    const lead = await db.lead.create({
      data: {
        email,
        name: body.name || null,
        company: body.company || null,
        position: body.position || null,
        source: 'manual',
        unsubToken: makeToken(email),
      },
    })
    await logLeadEvent(lead.id, 'IMPORT', 'Lead añadido manualmente')
    return NextResponse.json(lead, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Ese lead ya existe' }, { status: 400 })
  }
}

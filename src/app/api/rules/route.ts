import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const rules = await db.reEngageRule.findMany({ orderBy: { key: 'asc' } })
  return NextResponse.json({ rules })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  try {
    const rule = await db.reEngageRule.update({
      where: { id: String(body.id) },
      data: {
        ...(body.enabled !== undefined ? { enabled: !!body.enabled } : {}),
        ...(body.threshold !== undefined
          ? { threshold: Math.max(1, Math.min(90, parseInt(String(body.threshold), 10) || 2)) }
          : {}),
        ...(body.action !== undefined ? { action: String(body.action) } : {}),
        ...(body.promoCampaignId !== undefined ? { promoCampaignId: body.promoCampaignId || null } : {}),
        ...(body.name !== undefined ? { name: String(body.name).slice(0, 120) } : {}),
      },
    })
    return NextResponse.json(rule)
  } catch {
    return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 })
  }
}

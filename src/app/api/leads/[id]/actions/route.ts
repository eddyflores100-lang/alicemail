import { NextRequest, NextResponse } from 'next/server'
import { manualAddToPromotion, manualChangeAngle, manualResend } from '@/lib/crm'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const action = String(body.action || '')

  if (action === 'change_angle') {
    if (!body.angleId) return NextResponse.json({ error: 'Falta angleId' }, { status: 400 })
    const r = await manualChangeAngle(id, String(body.angleId))
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  if (action === 'add_promo') {
    if (!body.campaignId) return NextResponse.json({ error: 'Falta campaignId' }, { status: 400 })
    const r = await manualAddToPromotion(id, String(body.campaignId))
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  if (action === 'resend') {
    const r = await manualResend(id)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}

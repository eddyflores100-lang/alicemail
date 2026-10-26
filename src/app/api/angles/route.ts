import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const angles = await db.angle.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ angles })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = String(body.name || '').trim()
  const subject = String(body.subject || '').trim()
  const bodyTpl = String(body.body || '').trim()
  if (!name || !subject || !bodyTpl) {
    return NextResponse.json({ error: 'Nombre, asunto y cuerpo son obligatorios' }, { status: 400 })
  }
  try {
    const angle = await db.angle.create({
      data: {
        name,
        description: String(body.description || '').trim(),
        subject,
        body: bodyTpl,
        active: body.active !== false,
      },
    })
    return NextResponse.json(angle, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Ya existe un enfoque con ese nombre' }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  try {
    const angle = await db.angle.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.description !== undefined ? { description: String(body.description).trim() } : {}),
        ...(body.subject !== undefined ? { subject: String(body.subject).trim() } : {}),
        ...(body.body !== undefined ? { body: String(body.body) } : {}),
        ...(body.active !== undefined ? { active: !!body.active } : {}),
      },
    })
    return NextResponse.json(angle)
  } catch {
    return NextResponse.json({ error: 'Enfoque no encontrado' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await db.angle.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

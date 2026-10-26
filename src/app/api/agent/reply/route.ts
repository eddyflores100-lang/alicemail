import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendAgentReply } from '@/lib/agent'

export async function POST(req: NextRequest) {
  const { messageId, body } = await req.json()
  const msg = await db.inboxMessage.findUnique({ where: { id: messageId } })
  if (!msg) return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 })
  const text = body || msg.aiReply
  if (!text) return NextResponse.json({ error: 'No hay borrador ni texto de respuesta' }, { status: 400 })
  const ok = await sendAgentReply(msg, text, 'ASSIST')
  if (!ok) return NextResponse.json({ error: 'No se pudo enviar la respuesta (revisa el buzón)' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

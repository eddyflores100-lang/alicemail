import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classifyReply } from '@/lib/ai'
import { logEvent } from '@/lib/agent'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const onlyUnread = url.searchParams.get('unread') === '1'
  const filter = url.searchParams.get('filter')
  const where: Record<string, unknown> = {}
  if (onlyUnread) where.read = false
  if (filter === 'unclassified') Object.assign(where, { isReply: true, classified: false })
  if (filter === 'replies') Object.assign(where, { isReply: true, isBounce: false })
  if (filter === 'hot') Object.assign(where, { isReply: true, temperature: 'HOT' })
  if (filter === 'drafts') Object.assign(where, { isReply: true, classified: true, repliedAt: null, isBounce: false, aiReply: { not: null } })
  const messages = await db.inboxMessage.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    take: 100,
    include: { mailbox: { select: { email: true } } },
  })
  const unreadCount = await db.inboxMessage.count({ where: { read: false } })
  const unclassifiedCount = await db.inboxMessage.count({ where: { isReply: true, classified: false } })
  return NextResponse.json({
    unreadCount,
    unclassifiedCount,
    messages: messages.map((m) => ({
      id: m.id,
      from: m.fromEmail,
      subject: m.subject,
      body: m.body.slice(0, 1200),
      isReply: m.isReply,
      isBounce: m.isBounce,
      read: m.read,
      receivedAt: m.receivedAt,
      mailbox: m.mailbox.email,
      temperature: m.temperature,
      aiIntent: m.aiIntent,
      aiSummary: m.aiSummary,
      aiReply: m.aiReply,
      classified: m.classified,
      repliedAt: m.repliedAt,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  if (body.all) {
    await db.inboxMessage.updateMany({ where: { read: false }, data: { read: true } })
    return NextResponse.json({ ok: true })
  }
  if (body.classify) {
    // fuerza clasificación IA de un mensaje concreto
    const msg = await db.inboxMessage.findUnique({ where: { id: body.classify } })
    if (!msg) return NextResponse.json({ error: 'Mensaje no encontrado' }, { status: 404 })
    const r = await classifyReply({ from: msg.fromEmail, subject: msg.subject, body: msg.body })
    await db.inboxMessage.update({
      where: { id: msg.id },
      data: { temperature: r.temperature, aiIntent: r.intent, aiSummary: r.summary, aiReply: r.reply, classified: true },
    })
    const lead = await db.lead.findFirst({ where: { email: msg.fromEmail } })
    if (lead && r.temperature !== 'OOO') {
      await db.lead.update({
        where: { id: lead.id },
        data: { temperature: r.temperature, temperatureAt: new Date(), aiNotes: r.summary },
      })
    }
    await logEvent('CLASSIFY', 'INFO', `Clasificación manual de ${msg.fromEmail}: ${r.temperature}`, { messageId: msg.id })
    return NextResponse.json({ ok: true, temperature: r.temperature, summary: r.summary, reply: r.reply, source: r.source })
  }
  if (body.id) await db.inboxMessage.update({ where: { id: body.id }, data: { read: true } })
  return NextResponse.json({ ok: true })
}

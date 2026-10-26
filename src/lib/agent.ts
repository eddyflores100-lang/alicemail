// ─────────────────────────────────────────────────────────────────────
// AliceMail — Agente IA que controla la plataforma
// Ciclo: 1) clasifica respuestas nuevas (caliente/tibio/frío/OOO)
//        2) actúa según autonomía: responde a calientes, deja borradores
//        3) guarda la salud de los buzones (errores, rebotes)
//        4) informe diario al canal configurado (Telegram/WhatsApp)
// ─────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import type { InboxMessage, Mailbox } from '@prisma/client'
import { classifyReply } from '@/lib/ai'
import { notify } from '@/lib/notify'
import { sendViaSmtp } from '@/lib/mailer'
import { getSettings, todayKey } from '@/lib/settings'
import { getQuotaSummary } from '@/lib/quota'
import { applyReplyClassification, crmPhase } from '@/lib/crm'

const MAX_CLASSIFY_PER_CYCLE = 8

export interface AgentCycleResult {
  ran: boolean
  classified: number
  hot: number
  autoReplies: number
  guards: number
  reportSent: boolean
  crm: { resend: number; angleChange: number; promoAdded: number }
}

export async function agentCycle(manual = false): Promise<AgentCycleResult> {
  const s = await getSettings()
  if (!s.agentEnabled && !manual) {
    return { ran: false, classified: 0, hot: 0, autoReplies: 0, guards: 0, reportSent: false, crm: { resend: 0, angleChange: 0, promoAdded: 0 } }
  }
  let hot = 0
  let autoReplies = 0

  // ── 1. Clasificar respuestas pendientes ────────────────────────────
  const pending = await db.inboxMessage.findMany({
    where: { isReply: true, isBounce: false, classified: false },
    include: { mailbox: true },
    orderBy: { receivedAt: 'asc' },
    take: MAX_CLASSIFY_PER_CYCLE,
  })
  let classified = 0
  for (const msg of pending) {
    try {
      const r = await classifyReply({ from: msg.fromEmail, subject: msg.subject, body: msg.body })
      await db.inboxMessage.update({
        where: { id: msg.id },
        data: {
          temperature: r.temperature,
          aiIntent: r.intent,
          aiSummary: r.summary,
          aiReply: r.reply,
          classified: true,
        },
      })
      classified++
      const lead = await db.lead.findFirst({ where: { email: msg.fromEmail } })
      if (lead && (r.temperature === 'HOT' || r.temperature === 'WARM' || r.temperature === 'COLD')) {
        // catalogación CRM: temperatura + etapa del pipeline + timeline
        await applyReplyClassification(lead, r, r.intent)
      }
      await logEvent(
        'CLASSIFY',
        r.temperature === 'HOT' ? 'SUCCESS' : 'INFO',
        `Respuesta de ${msg.fromEmail} clasificada como ${r.temperature} · ${r.intent}`,
        { messageId: msg.id, source: r.source, summary: r.summary }
      )
      await notify('reply', `Respuesta de ${msg.fromEmail}`, `${r.summary}\nClasificación: ${r.temperature}`)
      if (r.temperature === 'HOT') {
        hot++
        await notify('hot', `🔥 Lead CALIENTE: ${msg.fromEmail}`, `${r.summary}\nIntención: ${r.intent}`)
        if (s.agentAutonomy === 'AUTO' && r.reply) {
          const sent = await sendAgentReply(msg, r.reply, s.agentAutonomy)
          if (sent) autoReplies++
        }
      }
    } catch (err) {
      await logEvent('CLASSIFY', 'ERROR', `Fallo clasificando mensaje ${msg.id}: ${errText(err)}`)
    }
  }

  // ── 2. CRM: re-engagement según reglas (abre → reenvío / enfoque / otra promo) ──
  const crm = await crmPhase(manual)

  // ── 3. Guardián de salud de buzones ───────────────────────────────
  const guards = await guardPhase(s.agentAutonomy)

  // ── 4. Informe diario (una vez al día, a partir de la hora configurada) ──
  const reportSent = await dailyReport()

  return { ran: true, classified, hot, autoReplies, guards, reportSent, crm }
}

// ─── Guardián: buzones con errores o pico de rebotes ─────────────────
async function guardPhase(autonomy: string): Promise<number> {
  let actions = 0
  const mbs = await db.mailbox.findMany()
  for (const mb of mbs) {
    // errores SMTP consecutivos → avisar (y pausar en AUTO)
    if (mb.verified && (mb.consecutiveErrors >= 2 || mb.status === 'ERROR')) {
      const recent = await recentGuard(mb.id, 'guard-err')
      if (!recent) {
        await logEvent('GUARD', 'WARN', `Buzón ${mb.email} con ${mb.consecutiveErrors} errores SMTP seguidos`, {
          mailboxId: mb.id,
          key: 'guard-err',
          lastError: mb.lastError,
        })
        await notify('error', `⚠️ Problema en ${mb.email}`, `${mb.consecutiveErrors} errores seguidos. Último: ${mb.lastError || 'desconocido'}`)
        if (autonomy === 'AUTO' && mb.status !== 'PAUSED') {
          await db.mailbox.update({ where: { id: mb.id }, data: { status: 'PAUSED' } })
          await logEvent('GUARD', 'ACTION', `Buzón ${mb.email} pausado automáticamente por el agente`, { mailboxId: mb.id, key: 'guard-err' })
        }
        actions++
      }
    }
    // pico de rebotes en 48h → avisar (la penalización −25% ya la aplica el motor)
    const bounces = await db.inboxMessage.count({
      where: { mailboxId: mb.id, isBounce: true, receivedAt: { gte: new Date(Date.now() - 48 * 3_600_000) } },
    })
    if (bounces >= 3) {
      const recent = await recentGuard(mb.id, 'guard-bounce')
      if (!recent) {
        await logEvent('GUARD', 'WARN', `Buzón ${mb.email}: ${bounces} rebotes en 48 h — reputación en riesgo`, {
          mailboxId: mb.id,
          key: 'guard-bounce',
          bounces,
        })
        await notify('bounce', `⚠️ Rebotes en ${mb.email}`, `${bounces} rebotes en 48 h. Warmup penalizado −25% y pausa de campañas recomendada.`)
        actions++
      }
    }
  }
  return actions
}

async function recentGuard(mailboxId: string, key: string): Promise<boolean> {
  const last = await db.agentEvent.findFirst({
    where: { type: 'GUARD', meta: { contains: key }, createdAt: { gte: new Date(Date.now() - 2 * 3_600_000) } },
  })
  if (!last) return false
  try {
    const meta = JSON.parse(last.meta || '{}') as { mailboxId?: string }
    return meta.mailboxId === mailboxId
  } catch {
    return false
  }
}

// ─── Informe diario ──────────────────────────────────────────────────
async function dailyReport(): Promise<boolean> {
  const s = await getSettings()
  const hour = new Date().getHours()
  if (hour < s.dailyReportHour) return false
  const already = await db.notification.findFirst({
    where: { event: 'daily', createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
  })
  if (already) return false

  const quota = await getQuotaSummary()
  const startDay = new Date(new Date().setHours(0, 0, 0, 0))
  const [campaignToday, warmupToday, repliesToday, bouncesToday, hotLeads, mbStatus] = await Promise.all([
    db.send.count({ where: { kind: 'CAMPAIGN', status: 'SENT', sentAt: { gte: startDay } } }),
    db.send.count({ where: { kind: 'WARMUP', status: 'SENT', sentAt: { gte: startDay } } }),
    db.inboxMessage.count({ where: { isReply: true, receivedAt: { gte: startDay } } }),
    db.inboxMessage.count({ where: { isBounce: true, receivedAt: { gte: startDay } } }),
    db.lead.count({ where: { temperature: 'HOT' } }),
    db.mailbox.groupBy({ by: ['status'], _count: true }),
  ])
  const statusLine = mbStatus
    .map((g) => `${g._count} ${g.status === 'ACTIVE' ? 'activos' : g.status === 'WARMUP' ? 'calentando' : g.status === 'PAUSED' ? 'pausados' : 'error'}`)
    .join(', ')

  const body = [
    `Informe diario AliceMail — ${new Date().toLocaleDateString('es', { day: '2-digit', month: 'long' })}`,
    ``,
    `✉️ Enviados hoy: ${campaignToday} campaña + ${warmupToday} warmup`,
    `📬 Cuota restante hoy: ${quota.campaignRemaining}/${quota.campaignCap}`,
    `💬 Respuestas hoy: ${repliesToday} · 🔥 leads calientes: ${hotLeads} · ↩️ rebotes: ${bouncesToday}`,
    `📧 Buzones: ${statusLine}`,
  ].join('\n')

  await notify('daily', 'Informe diario AliceMail', body)
  await logEvent('REPORT', 'INFO', `Informe diario enviado (${todayKey()})`, { campaignToday, warmupToday, repliesToday, hotLeads })
  return true
}

// ─── Enviar respuesta del agente (auto o aprobada desde la UI/MCP) ───
export async function sendAgentReply(msg: InboxMessage, body: string, autonomy: string): Promise<boolean> {
  const mb: Mailbox | null = await db.mailbox.findUnique({ where: { id: msg.mailboxId } })
  if (!mb || !mb.verified) {
    await logEvent('ACTION', 'ERROR', `No se pudo responder a ${msg.fromEmail}: buzón no disponible o sin verificar`)
    return false
  }
  const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`
  try {
    const { messageId } = await sendViaSmtp(mb, {
      fromName: mb.displayName,
      to: msg.fromEmail,
      subject,
      text: body,
      html: body
        .split('\n')
        .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '&nbsp;'}</p>`)
        .join(''),
      inReplyTo: msg.messageId,
    })
    await db.send.create({
      data: {
        kind: 'AGENT',
        mailboxId: mb.id,
        leadId: (await db.lead.findFirst({ where: { email: msg.fromEmail } }))?.id,
        toEmail: msg.fromEmail,
        subject,
        messageId,
        status: 'SENT',
      },
    })
    await db.inboxMessage.update({ where: { id: msg.id }, data: { repliedAt: new Date(), actedAt: new Date() } })
    const autonomyLabel = autonomy === 'AUTO' ? 'automática' : 'aprobada por el dueño'
    await logEvent('ACTION', 'SUCCESS', `Respuesta ${autonomyLabel} enviada a ${msg.fromEmail}`, {
      messageId: msg.id,
      subject,
    })
    return true
  } catch (err) {
    await logEvent('ACTION', 'ERROR', `Fallo enviando respuesta a ${msg.fromEmail}: ${errText(err)}`)
    return false
  }
}

export async function logEvent(
  type: 'CLASSIFY' | 'ACTION' | 'GUARD' | 'REPORT' | 'NOTIFY' | 'SYSTEM' | 'CRM',
  level: 'INFO' | 'ACTION' | 'SUCCESS' | 'WARN' | 'ERROR',
  message: string,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await db.agentEvent.create({
      data: {
        type,
        level,
        message: message.slice(0, 500),
        meta: meta ? JSON.stringify(meta).slice(0, 1500) : null,
      },
    })
  } catch {
    /* nunca interrumpe el ciclo */
  }
}

function errText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200)
}

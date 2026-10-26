// ─────────────────────────────────────────────────────────────────────
// AliceMail — Motor de envío
//  · Warmup con rampa automática (inicio→máx, +ramp/día, penalización -25%)
//  · Campañas con secuencia y follow-ups, rotación de buzones y topes diarios
//  · Sincronización IMAP: respuestas (stop-on-reply) y rebotes
//  · Ventana horaria humana y envíos distribuidos en el tiempo
// ─────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import type { Mailbox, Lead, Campaign, SequenceStep, Enrollment } from '@prisma/client'
import { sendViaSmtp, fetchImapMessages } from '@/lib/mailer'
import { textToHtml, renderTemplate, injectTracking, buildHeaders } from '@/lib/template'
import { generateWarmupEmail } from '@/lib/warmup-content'
import { getSettings, todayKey } from '@/lib/settings'
import { agentCycle, logEvent } from '@/lib/agent'
import { getQuotaSummary } from '@/lib/quota'
import { logLeadEvent } from '@/lib/crm'
import { syncCycle } from '@/lib/githubSync'

const TICK_MS = 45_000
const IMAP_EVERY_TICKS = 7 // ~5 min
const MAX_WARMUP_PER_TICK = 2 // por buzón, para repartir el día
const MAX_CAMPAIGN_PER_TICK = 10

let started = false
let tickCount = 0
let running = false

export function startWorker(): void {
  if (started) return
  started = true
  console.log('[AliceMail] motor iniciado — tick cada 45s')
  setTimeout(() => void tick(), 8_000)
  setInterval(() => void tick(), TICK_MS)
}

export async function tick(): Promise<{ ok: boolean; reason?: string }> {
  if (running) return { ok: false, reason: 'tick en curso' }
  running = true
  try {
    const settings = await getSettings()
    if (!settings.workerEnabled) return { ok: false, reason: 'motor pausado' }

    tickCount++
    await resetDailyCounters()
    const inWindow = isWithinWindow(settings.windowStart, settings.windowEnd)
    const mailboxes = await db.mailbox.findMany({
      where: { verified: true, status: { in: ['WARMUP', 'ACTIVE'] } },
    })

    let warmupSent = 0
    let campaignSent = 0
    if (inWindow && mailboxes.length >= 1) {
      warmupSent = await warmupPhase(mailboxes)
      campaignSent = await campaignPhase(mailboxes, settings)
    }
    if (tickCount % IMAP_EVERY_TICKS === 0) {
      await imapPhase(mailboxes)
    }
    // Fase 4: agente IA (clasifica respuestas, guardianes, informe) — cada 2 ticks (~90 s)
    if (settings.agentEnabled && tickCount % 2 === 0) {
      try {
        const r = await agentCycle()
        if (r.classified > 0 || r.guards > 0 || r.reportSent) {
          console.log(
            `[AliceMail] agente: ${r.classified} clasif · ${r.hot} calientes · ${r.autoReplies} respuestas · ${r.guards} guardianes`
          )
        }
      } catch (err) {
        await logEvent('SYSTEM', 'ERROR', `Ciclo del agente falló: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    // Fase 5: puente GitHub ↔ VM (comandos web, importaciones, push de estado) — cada 4 ticks (~3 min)
    if (tickCount % 4 === 0) {
      try {
        const s = await syncCycle()
        if (s.ok && (s.commands || s.imports || s.mailboxes)) {
          console.log(`[AliceMail] sync: ${s.commands || 0} comandos · ${s.imports || 0} imports · ${s.mailboxes || 0} buzones`)
        }
      } catch (err) {
        await logEvent('SYSTEM', 'ERROR', `Sync GitHub falló: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return { ok: true, reason: `warmup:${warmupSent} campaña:${campaignSent}` }
  } finally {
    running = false
  }
}

function isWithinWindow(start: number, end: number): boolean {
  const h = new Date().getHours()
  if (start <= end) return h >= start && h < end
  return h >= start || h < end // ventana nocturna cruzando medianoche
}

async function resetDailyCounters(): Promise<void> {
  const today = todayKey()
  await db.mailbox.updateMany({
    where: { counterDate: { not: today } },
    data: { counterDate: today, sentWarmupToday: 0, sentCampaignToday: 0 },
  })
}

// ─── Fase 1: WARMUP ──────────────────────────────────────────────────
export function warmupTargetFor(mb: Mailbox, hasCampaignToday: boolean): number {
  const days = Math.floor(
    (Date.now() - new Date(mb.warmupStartedAt).getTime()) / 86_400_000
  )
  let target = Math.min(mb.warmupStart + mb.warmupRamp * days, mb.warmupMax)
  if (mb.penaltyUntil && new Date(mb.penaltyUntil) > new Date()) {
    target = Math.max(1, Math.round(target * 0.75)) // penalización estilo anti-spam
  }
  if (hasCampaignToday) target = Math.min(target, 5) // campaña activa → warmup ligero
  return target
}

async function warmupPhase(mailboxes: Mailbox[]): Promise<number> {
  let total = 0
  for (const mb of mailboxes) {
    if (mb.sentWarmupToday >= mb.warmupMax) continue
    const target = warmupTargetFor(mb, mb.sentCampaignToday > 0)
    if (mb.sentWarmupToday >= target) continue

    const partners = mailboxes.filter((m) => m.id !== mb.id)
    if (!partners.length) continue

    // dispersión: 35% de probabilidad de esperar al siguiente tick
    if (Math.random() < 0.35) continue

    for (let i = 0; i < MAX_WARMUP_PER_TICK; i++) {
      const current = await db.mailbox.findUnique({ where: { id: mb.id } })
      if (!current || current.sentWarmupToday >= target) break
      const partner = pickRandom(partners)
      await sendWarmupEmail(current, partner)
      total++
    }
  }
  return total
}

async function sendWarmupEmail(mb: Mailbox, partner: Mailbox): Promise<void> {
  const first = partner.displayName.split(' ')[0] || partner.email.split('@')[0]
  const { subject, body } = generateWarmupEmail(mb.displayName, first)
  const html = textToHtml(body)
  try {
    const { messageId } = await sendViaSmtp(mb, {
      fromName: mb.displayName,
      to: partner.email,
      subject,
      text: body,
      html,
    })
    await db.send.create({
      data: {
        kind: 'WARMUP',
        mailboxId: mb.id,
        partnerId: partner.id,
        toEmail: partner.email,
        subject,
        messageId,
        status: 'SENT',
      },
    })
    await db.mailbox.update({
      where: { id: mb.id },
      data: { sentWarmupToday: { increment: 1 }, consecutiveErrors: 0 },
    })
  } catch (err) {
    await registerSendError(mb, err, {
      kind: 'WARMUP',
      partnerId: partner.id,
      toEmail: partner.email,
      subject,
    })
  }
}

async function registerSendError(
  mb: Mailbox,
  err: unknown,
  base: { kind: string; partnerId?: string; campaignId?: string; leadId?: string; stepNumber?: number; toEmail: string; subject: string }
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err)
  const consecutive = mb.consecutiveErrors + 1
  await db.send.create({
    data: { ...base, status: 'FAILED', error: msg.slice(0, 500) },
  })
  await db.mailbox.update({
    where: { id: mb.id },
    data: {
      consecutiveErrors: consecutive,
      lastError: msg.slice(0, 300),
      status: consecutive >= 3 ? 'ERROR' : mb.status,
    },
  })
}

// ─── Fase 2: CAMPAÑAS ────────────────────────────────────────────────
const OK_LEAD_STATUS = ['NEW', 'ACTIVE']

async function campaignPhase(mailboxes: Mailbox[], settings: Awaited<ReturnType<typeof getSettings>>): Promise<number> {
  const campaigns = await db.campaign.findMany({ where: { status: 'RUNNING' } })
  if (!campaigns.length) return 0
  let total = 0

  for (const campaign of campaigns) {
    const sentTodayGlobal = await db.send.count({
      where: { kind: 'CAMPAIGN', campaignId: campaign.id, sentAt: { gte: startOfDay() } },
    })
    let budget = campaign.dailyTarget - sentTodayGlobal
    // tope global diario configurado en Ajustes
    const quota = await getQuotaSummary()
    const globalRemaining = quota.campaignRemaining - total
    if (budget > globalRemaining) budget = globalRemaining
    if (budget <= 0) break

    const steps = await db.sequenceStep.findMany({
      where: { campaignId: campaign.id },
      orderBy: { stepNumber: 'asc' },
    })
    if (!steps.length) continue

    const due = await db.enrollment.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ['QUEUED', 'IN_PROGRESS'] },
        OR: [{ nextSendAt: null }, { nextSendAt: { lte: new Date() } }],
      },
      include: { lead: true },
      orderBy: [{ nextSendAt: 'asc' }, { createdAt: 'asc' }],
      take: 40,
    })

    for (const en of due) {
      if (budget <= 0 || total >= MAX_CAMPAIGN_PER_TICK) break
      if (!OK_LEAD_STATUS.includes(en.lead.status)) {
        await db.enrollment.update({ where: { id: en.id }, data: { status: 'FINISHED' } })
        continue
      }
      const step = steps.find((s) => s.stepNumber === en.currentStep + 1)
      if (!step) {
        await db.enrollment.update({ where: { id: en.id }, data: { status: 'FINISHED' } })
        continue
      }
      const mb = pickMailboxWithCapacity(mailboxes, en, campaign)
      if (!mb) continue // todos los buzones al tope hoy

      const ok = await sendCampaignEmail(mb, campaign, step, en, settings)
      if (ok) {
        budget--
        total++
        const nextStep = steps.find((s) => s.stepNumber === step.stepNumber + 1)
        await db.enrollment.update({
          where: { id: en.id },
          data: {
            currentStep: step.stepNumber,
            status: nextStep ? 'IN_PROGRESS' : 'FINISHED',
            lastSentAt: new Date(),
            nextSendAt: nextStep ? addDaysWithJitter(nextStep.delayDays) : null,
          },
        })
      }
    }
  }
  return total
}

function pickMailboxWithCapacity(
  mailboxes: Mailbox[],
  en: Enrollment,
  campaign: Campaign
): Mailbox | null {
  const candidates = mailboxes.filter((m) => m.sentCampaignToday < m.campaignDailyLimit)
  if (!candidates.length) return null
  // primero respeta el buzón asignado; si agotó cupo, rota
  const assigned = candidates.find((m) => m.id === en.mailboxId)
  if (assigned) return assigned
  // rotación ponderada por cupo restante
  const weighted: Mailbox[] = []
  for (const m of candidates) {
    const remaining = m.campaignDailyLimit - m.sentCampaignToday
    const weight = Math.max(1, Math.round(remaining / 5))
    for (let i = 0; i < weight; i++) weighted.push(m)
  }
  return pickRandom(weighted) || null
}

async function sendCampaignEmail(
  mb: Mailbox,
  campaign: Campaign,
  step: SequenceStep,
  en: Enrollment & { lead: Lead },
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<boolean> {
  const lead = en.lead
  const vars = { nombre: lead.name, empresa: lead.company, cargo: lead.position, email: lead.email }
  const signature = settings.signature ? `\n\n${settings.signature}` : ''
  const text = renderTemplate(step.body, vars) + signature
  let html = textToHtml(text)
  const followUp = step.stepNumber > 1
  const subject = renderTemplate(step.subject, vars)
  if (campaign.trackOpens && settings.trackingUrl) {
    html = injectTracking(html, {
      baseUrl: settings.trackingUrl,
      campaignId: campaign.id,
      leadId: lead.id,
      stepNumber: step.stepNumber,
      unsubToken: lead.unsubToken,
    })
  }
  try {
    const { messageId } = await sendViaSmtp(mb, {
      fromName: campaign.fromName,
      to: lead.email,
      subject,
      text,
      html,
      headers: buildHeaders({
        unsubToken: lead.unsubToken,
        baseUrl: settings.trackingUrl || 'https://example.com',
        campaignId: campaign.id,
      }),
    })
    await db.send.create({
      data: {
        kind: 'CAMPAIGN',
        mailboxId: mb.id,
        campaignId: campaign.id,
        leadId: lead.id,
        stepNumber: step.stepNumber,
        toEmail: lead.email,
        subject: followUp ? `Re: ${subject}` : subject,
        messageId,
        status: 'SENT',
      },
    })
    await db.mailbox.update({
      where: { id: mb.id },
      data: { sentCampaignToday: { increment: 1 }, consecutiveErrors: 0 },
    })
    await db.lead.update({
      where: { id: lead.id },
      data: { status: 'ACTIVE', lastContactedAt: new Date() },
    })
    await logLeadEvent(
      lead.id,
      'SENT',
      followUp ? `Seguimiento ${step.stepNumber} enviado` : 'Primer correo enviado',
      subject
    )
    return true
  } catch (err) {
    await registerSendError(mb, err, {
      kind: 'CAMPAIGN',
      campaignId: campaign.id,
      leadId: lead.id,
      stepNumber: step.stepNumber,
      toEmail: lead.email,
      subject,
    })
    return false
  }
}

function addDaysWithJitter(days: number): Date {
  const ms =
    days * 86_400_000 +
    Math.floor(Math.random() * 4) * 3_600_000 + // 0-3h de jitter
    Math.floor(Math.random() * 60) * 60_000
  return new Date(Date.now() + ms)
}

function startOfDay(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── Fase 3: IMAP (respuestas y rebotes) ─────────────────────────
// El análisis IA (clasificación, guardianes) vive en src/lib/agent.ts
export async function imapPhase(mailboxes: Mailbox[]): Promise<void> {
  for (const mb of mailboxes) {
    if (!mb.imapHost) continue
    const since = mb.lastImapSync || new Date(Date.now() - 24 * 3_600_000)
    try {
      const messages = await fetchImapMessages(mb, since)
      for (const msg of messages) {
        const exists = await db.inboxMessage.findFirst({ where: { messageId: msg.messageId } })
        if (exists) continue
        const isBounce = /mailer-daemon|postmaster|mail delivery|no-reply@/i.test(msg.fromEmail) || /delivery (failed|status notification)/i.test(msg.subject)
        let isReply = false
        const lead = await db.lead.findFirst({ where: { email: msg.fromEmail } })
        if (lead && !isBounce) {
          isReply = true
          await db.lead.update({ where: { id: lead.id }, data: { status: 'REPLIED' } })
          await db.enrollment.updateMany({
            where: { leadId: lead.id, status: { in: ['QUEUED', 'IN_PROGRESS'] } },
            data: { status: 'REPLIED' },
          })
          await logLeadEvent(lead.id, 'REPLY', 'Nueva respuesta en la bandeja', msg.subject)
        }
        if (isBounce && lead) {
          await db.lead.update({ where: { id: lead.id }, data: { status: 'BOUNCED' } })
          await db.enrollment.updateMany({
            where: { leadId: lead.id, status: { in: ['QUEUED', 'IN_PROGRESS'] } },
            data: { status: 'BOUNCED' },
          })
          await logLeadEvent(lead.id, 'BOUNCE', 'Correo rebotado (dirección inválida)', msg.subject)
        }
        await db.inboxMessage.create({
          data: {
            mailboxId: mb.id,
            fromEmail: msg.fromEmail,
            subject: msg.subject,
            body: msg.body,
            messageId: msg.messageId,
            isReply,
            isBounce,
            receivedAt: msg.date,
          },
        })
        if (isBounce) {
          // penalización de reputación 48h (−25%)
          await db.mailbox.update({
            where: { id: mb.id },
            data: { penaltyUntil: new Date(Date.now() + 48 * 3_600_000) },
          })
        }
      }
      await db.mailbox.update({ where: { id: mb.id }, data: { lastImapSync: new Date() } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await db.mailbox.update({
        where: { id: mb.id },
        data: { lastError: `IMAP: ${msg.slice(0, 250)}` },
      })
    }
  }
}

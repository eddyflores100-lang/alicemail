// ─────────────────────────────────────────────────────────────────────
// AliceMail v3 — CRM de leads
//  · Etapas del pipeline: NUEVO → CONTACTADO → CALIENTE/TIBIO/FRÍO →
//    RECHAZADO / RECUPERADO
//  · Timeline por lead (LeadEvent): enviado, abierto, respondió, etapa…
//  · Motor de re-engagement con reglas:
//      - Abrió N veces sin responder → re-envío o cambio de enfoque
//      - Frío desde hace N días      → meterlo en OTRA promoción
//      - Nunca abrió en N días       → re-envío
//  · Todo queda registrado (LeadEvent + AgentEvent) y notificado al dueño
// ─────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import type { Lead, Mailbox, Angle, Campaign } from '@prisma/client'
import { sendViaSmtp } from '@/lib/mailer'
import { textToHtml, renderTemplate, injectTracking, buildHeaders } from '@/lib/template'
import { getSettings } from '@/lib/settings'
import { getQuotaSummary } from '@/lib/quota'
import { notify } from '@/lib/notify'
import { logEvent } from '@/lib/agent'
import type { AiAnswer } from '@/lib/ai'

export const STAGES = ['NUEVO', 'CONTACTADO', 'CALIENTE', 'TIBIO', 'FRIO', 'RECHAZADO', 'RECUPERADO'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'En contacto',
  CALIENTE: 'Caliente',
  TIBIO: 'Tibio',
  FRIO: 'Frío',
  RECHAZADO: 'Rechazado',
  RECUPERADO: 'Recuperado',
}

export const STAGE_COLOR: Record<Stage, string> = {
  NUEVO: 'slate',
  CONTACTADO: 'sky',
  CALIENTE: 'red',
  TIBIO: 'amber',
  FRIO: 'cyan',
  RECHAZADO: 'zinc',
  RECUPERADO: 'emerald',
}

const MAX_ACTIONS_PER_CYCLE = 5
const REENGAGE_COOLDOWN_H = 72 // no re-activar al mismo lead antes de 72 h

// ─── Timeline ────────────────────────────────────────────────────────
export async function logLeadEvent(
  leadId: string,
  type: 'STAGE' | 'SENT' | 'OPEN' | 'REPLY' | 'BOUNCE' | 'REENGAGE' | 'ANGLE' | 'PROMO' | 'NOTE' | 'AGENT' | 'IMPORT',
  title: string,
  detail?: string
): Promise<void> {
  try {
    await db.leadEvent.create({
      data: { leadId, type, title: title.slice(0, 300), detail: detail?.slice(0, 1000) || null },
    })
  } catch {
    /* nunca interrumpe */
  }
}

// ─── Cambio de etapa del pipeline ────────────────────────────────────
export async function setLeadStage(
  lead: Lead,
  stage: Stage,
  opts: { source: string; detail?: string; silent?: boolean }
): Promise<Lead> {
  if (lead.stage === stage) return lead
  const updated = await db.lead.update({
    where: { id: lead.id },
    data: { stage, stageAt: new Date() },
  })
  await logLeadEvent(lead.id, 'STAGE', `Etapa: ${STAGE_LABEL[stage as Stage]}`, opts.detail || `vía ${opts.source}`)
  await logEvent('CRM', 'ACTION', `Lead ${lead.email} movido a ${STAGE_LABEL[stage as Stage]} (${opts.source})`, {
    leadId: lead.id,
    from: lead.stage,
    to: stage,
  })
  if (!opts.silent && (stage === 'CALIENTE' || stage === 'RECHAZADO' || stage === 'RECUPERADO')) {
    const icon = stage === 'CALIENTE' ? '🔥' : stage === 'RECHAZADO' ? '🚫' : '♻️'
    await notify(
      'crm',
      `${icon} Lead ${STAGE_LABEL[stage as Stage]}: ${lead.name || lead.email}`,
      `${lead.company ? `${lead.company} · ` : ''}${lead.email}\nMotivo: ${opts.detail || opts.source}`
    )
  }
  return updated
}

// ─── Apertura registrada (píxel de tracking) ─────────────────────────
export async function recordOpen(leadId: string, stepNumber = 0): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId } })
  if (!lead) return
  const firstToday = lead.lastOpenedAt ? Date.now() - lead.lastOpenedAt.getTime() > 6 * 3_600_000 : true
  await db.lead.update({
    where: { id: leadId },
    data: {
      openCount: { increment: 1 },
      score: { increment: firstToday ? 5 : 1 },
      lastOpenedAt: new Date(),
    },
  })
  if (firstToday) {
    await logLeadEvent(leadId, 'OPEN', `Abrió tu correo${stepNumber > 1 ? ` (seguimiento ${stepNumber})` : ''}`)
  }
}

// ─── Clasificación de respuesta → catalogación CRM ───────────────────
export async function applyReplyClassification(lead: Lead, r: AiAnswer, intent: string): Promise<void> {
  await db.lead.update({
    where: { id: lead.id },
    data: { temperature: r.temperature === 'OOO' ? lead.temperature : r.temperature, temperatureAt: new Date(), aiNotes: r.summary },
  })
  await db.lead.update({ where: { id: lead.id }, data: { score: { increment: 25 } } })
  await logLeadEvent(lead.id, 'REPLY', `Respondió: "${(r.summary || intent).slice(0, 120)}"`, `Temperatura: ${r.temperature}`)

  // catalogación automática según temperatura e intención
  if (r.temperature === 'HOT') {
    await setLeadStage(lead, 'CALIENTE', { source: 'agente IA', detail: r.summary })
  } else if (r.temperature === 'WARM') {
    await setLeadStage(lead, 'TIBIO', { source: 'agente IA', detail: r.summary })
  } else if (r.temperature === 'COLD') {
    const rejection = /no interesado|baja|unsubs|do not contact|no contactar/i.test(intent + ' ' + (r.summary || ''))
    await setLeadStage(lead, rejection ? 'RECHAZADO' : 'FRIO', { source: 'agente IA', detail: r.summary })
  }
  // OOO: no cambia etapa, el agente reintentará después
}

// ─── Motor de re-engagement ──────────────────────────────────────────
export interface CrmPhaseResult {
  ran: boolean
  resend: number
  angleChange: number
  promoAdded: number
  skipped: number
}

export async function crmPhase(manual = false): Promise<CrmPhaseResult> {
  const out: CrmPhaseResult = { ran: false, resend: 0, angleChange: 0, promoAdded: 0, skipped: 0 }
  const s = await getSettings()
  const rules = await db.reEngageRule.findMany({ where: { enabled: true }, orderBy: { key: 'asc' } })
  if (!rules.length) return out
  if (!inWindow(s.windowStart, s.windowEnd) && !manual) return out

  const quota = await getQuotaSummary()
  let budget = Math.min(quota.campaignRemaining, MAX_ACTIONS_PER_CYCLE)
  out.ran = true

  for (const rule of rules) {
    if (budget <= 0) break
    const candidates = await findCandidates(rule)
    let fired = 0
    for (const lead of candidates) {
      if (budget <= 0 || fired >= 3) break
      // guardas universales
      if (lead.stage === 'RECHAZADO') { out.skipped++; continue }
      if (['UNSUBSCRIBED', 'BOUNCED', 'PAUSED'].includes(lead.status)) { out.skipped++; continue }
      if (lead.lastReengageAt && Date.now() - lead.lastReengageAt.getTime() < REENGAGE_COOLDOWN_H * 3_600_000) {
        out.skipped++
        continue
      }
      const ok = await executeAction(rule, lead, s.signature)
      if (ok) {
        fired++
        budget--
        if (rule.action === 'RESEND') out.resend++
        else if (rule.action === 'CHANGE_ANGLE') out.angleChange++
        else if (rule.action === 'NEW_PROMO') out.promoAdded++
      } else {
        out.skipped++
      }
    }
    if (fired > 0) {
      await db.reEngageRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date(), firedCount: { increment: fired } },
      })
    }
  }
  return out
}

function inWindow(start: number, end: number): boolean {
  const h = new Date().getHours()
  if (start <= end) return h >= start && h < end
  return h >= start || h < end
}

async function findCandidates(rule: { trigger: string; threshold: number }): Promise<Lead[]> {
  const NO_REPLY_STAGES = ['CONTACTADO', 'TIBIO', 'FRIO', 'RECUPERADO']
  const repliedLeadIds = (
    await db.leadEvent.findMany({ where: { type: 'REPLY' }, select: { leadId: true }, distinct: ['leadId'] })
  ).map((e) => e.leadId)

  if (rule.trigger === 'OPENS_NO_REPLY') {
    return db.lead.findMany({
      where: {
        openCount: { gte: rule.threshold },
        stage: { in: NO_REPLY_STAGES },
        status: { in: ['NEW', 'ACTIVE'] },
        id: { notIn: repliedLeadIds },
      },
      orderBy: { lastOpenedAt: 'desc' },
      take: 10,
    })
  }
  if (rule.trigger === 'COLD_DAYS') {
    const cutoff = new Date(Date.now() - rule.threshold * 86_400_000)
    return db.lead.findMany({
      where: { stage: 'FRIO', stageAt: { lte: cutoff }, status: { in: ['NEW', 'ACTIVE'] } },
      orderBy: { stageAt: 'asc' },
      take: 10,
    })
  }
  // NO_OPEN: enviado hace N días y nunca abrió
  const cutoff = new Date(Date.now() - rule.threshold * 86_400_000)
  return db.lead.findMany({
    where: {
      openCount: 0,
      lastContactedAt: { lte: cutoff, not: null },
      stage: { in: NO_REPLY_STAGES },
      status: 'ACTIVE',
      id: { notIn: repliedLeadIds },
    },
    orderBy: { lastContactedAt: 'asc' },
    take: 10,
  })
}

async function executeAction(
  rule: { id: string; key: string; name: string; trigger: string; action: string; promoCampaignId: string | null },
  lead: Lead,
  signature: string
): Promise<boolean> {
  try {
    if (rule.action === 'NEW_PROMO') {
      return await addToPromotion(rule, lead)
    }
    if (rule.action === 'CHANGE_ANGLE') {
      const angle = await pickAngle(lead.currentAngle)
      if (!angle) {
        await logEvent('CRM', 'WARN', `Regla "${rule.name}": sin enfoques disponibles para ${lead.email}, hago re-envío simple`, { ruleId: rule.id })
        return await resendLast(rule, lead, signature)
      }
      const ok = await sendReengageEmail(lead, angle.subject, angle.body, signature, angle.name)
      if (ok) {
        await db.lead.update({
          where: { id: lead.id },
          data: { reengagedCount: { increment: 1 }, lastReengageAt: new Date(), currentAngle: angle.name, stage: 'RECUPERADO', stageAt: new Date() },
        })
        await logLeadEvent(lead.id, 'ANGLE', `Cambio de enfoque: "${angle.name}"`, angle.subject)
        await logEvent('CRM', 'SUCCESS', `Lead ${lead.email} re-activado con nuevo enfoque "${angle.name}" (regla: ${rule.name})`, {
          leadId: lead.id,
          ruleId: rule.id,
          angle: angle.name,
        })
        await notify('crm', `♻️ Re-activado con otro enfoque: ${lead.name || lead.email}`, `Regla: ${rule.name}\nEnfoque: ${angle.name}\nAsunto: ${angle.subject}`)
      }
      return ok
    }
    // RESEND
    return await resendLast(rule, lead, signature)
  } catch (err) {
    await logEvent('CRM', 'ERROR', `Fallo ejecutando regla "${rule.name}" sobre ${lead.email}: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

async function resendLast(
  rule: { id: string; name: string },
  lead: Lead,
  signature: string
): Promise<boolean> {
  const last = await db.send.findFirst({
    where: { leadId: lead.id, kind: 'CAMPAIGN', status: 'SENT' },
    orderBy: { sentAt: 'desc' },
  })
  const subject = last ? `Re: ${last.subject.replace(/^Re:\s*/i, '')}` : 'Te escribo de nuevo'
  const body = `Hola {{nombre}},

Te reenvío mi correo anterior por si se te pasó entre el ruido de la bandeja. Sigo pensando que podemos ayudar a {{empresa}} a conseguir más clientes con datos verificados.

Si no es buen momento, dime cuándo te viene mejor y no insisto más.

Un saludo.`
  const ok = await sendReengageEmail(lead, subject, body, signature, undefined)
  if (ok) {
    await db.lead.update({
      where: { id: lead.id },
      data: { reengagedCount: { increment: 1 }, lastReengageAt: new Date(), stage: 'RECUPERADO', stageAt: new Date() },
    })
    await logLeadEvent(lead.id, 'REENGAGE', `Re-envío automático (regla: ${rule.name})`, subject)
    await logEvent('CRM', 'SUCCESS', `Lead ${lead.email} re-enviado automáticamente (regla: ${rule.name})`, { leadId: lead.id, ruleId: rule.id })
    await notify('crm', `🔁 Re-envío a ${lead.name || lead.email}`, `Regla: ${rule.name}\nAsunto: ${subject}`)
  }
  return ok
}

async function pickAngle(exclude?: string | null): Promise<Angle | null> {
  const angles = await db.angle.findMany({ where: { active: true } })
  const pool = angles.filter((a) => a.name !== exclude)
  if (!pool.length) return angles[0] || null
  return pool[Math.floor(Math.random() * pool.length)]
}

async function addToPromotion(
  rule: { id: string; name: string; promoCampaignId: string | null },
  lead: Lead
): Promise<boolean> {
  if (!rule.promoCampaignId) {
    await logEvent('CRM', 'WARN', `Regla "${rule.name}" quiere meter leads en otra promoción pero no hay campaña configurada (elige una en Automatización)`, { ruleId: rule.id })
    return false
  }
  const promo = await db.campaign.findUnique({ where: { id: rule.promoCampaignId } })
  if (!promo || promo.status !== 'RUNNING') {
    await logEvent('CRM', 'WARN', `Promoción "${promo?.name || rule.promoCampaignId}" no está en marcha; lead ${lead.email} en espera`, { ruleId: rule.id })
    return false
  }
  const already = await db.enrollment.findFirst({ where: { campaignId: promo.id, leadId: lead.id } })
  if (already) return false
  const mb = await pickCrmMailbox()
  if (!mb) {
    await logEvent('CRM', 'WARN', `Sin buzón con cupo para meter a ${lead.email} en la promoción "${promo.name}"`)
    return false
  }
  await db.enrollment.create({
    data: { campaignId: promo.id, leadId: lead.id, mailboxId: mb.id, status: 'QUEUED', nextSendAt: new Date(Date.now() + 2 * 3_600_000) },
  })
  await db.lead.update({
    where: { id: lead.id },
    data: { reengagedCount: { increment: 1 }, lastReengageAt: new Date(), stage: 'RECUPERADO', stageAt: new Date() },
  })
  await logLeadEvent(lead.id, 'PROMO', `Metido en otra promoción: "${promo.name}"`, `El motor enviará el primer correo en ~2 h (buzón ${mb.email})`)
  await logEvent('CRM', 'SUCCESS', `Lead ${lead.email} añadido a la promoción "${promo.name}" (regla: ${rule.name})`, {
    leadId: lead.id,
    ruleId: rule.id,
    campaignId: promo.id,
  })
  await notify('crm', `🎯 ${lead.name || lead.email} → otra promoción`, `Regla: ${rule.name}\nPromoción: ${promo.name}\nEl primer correo sale en ~2 h`)
  return true
}

// ─── Envío de correo de re-engagement ────────────────────────────────
export async function sendReengageEmail(
  lead: Lead,
  subjectTpl: string,
  bodyTpl: string,
  signature: string,
  angleName?: string
): Promise<boolean> {
  const mb = await pickCrmMailbox()
  if (!mb) {
    await logEvent('CRM', 'WARN', `Sin buzón con cupo disponible para re-activar a ${lead.email}`)
    return false
  }
  const s = await getSettings()
  const vars = { nombre: lead.name, empresa: lead.company, cargo: lead.position, email: lead.email }
  const text = renderTemplate(bodyTpl, vars) + (signature ? `\n\n${signature}` : '')
  let html = textToHtml(text)
  const subject = renderTemplate(subjectTpl, vars)
  if (s.trackingUrl) {
    html = injectTracking(html, {
      baseUrl: s.trackingUrl,
      campaignId: 'CRM',
      leadId: lead.id,
      stepNumber: 0,
      unsubToken: lead.unsubToken,
    })
  }
  try {
    const { messageId } = await sendViaSmtp(mb, {
      fromName: mb.displayName,
      to: lead.email,
      subject,
      text,
      html,
      headers: buildHeaders({ unsubToken: lead.unsubToken, baseUrl: s.trackingUrl || 'https://example.com', campaignId: 'CRM' }),
    })
    await db.send.create({
      data: {
        kind: 'AGENT',
        mailboxId: mb.id,
        campaignId: 'CRM',
        leadId: lead.id,
        stepNumber: 0,
        toEmail: lead.email,
        subject,
        messageId,
        status: 'SENT',
      },
    })
    await db.mailbox.update({
      where: { id: mb.id },
      data: { sentCampaignToday: { increment: 1 }, consecutiveErrors: 0 },
    })
    await db.lead.update({ where: { id: lead.id }, data: { lastContactedAt: new Date(), status: 'ACTIVE' } })
    await logLeadEvent(lead.id, 'SENT', `Correo enviado${angleName ? ` (enfoque "${angleName}")` : ''}`, subject)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.send.create({
      data: {
        kind: 'AGENT',
        mailboxId: mb.id,
        campaignId: 'CRM',
        leadId: lead.id,
        toEmail: lead.email,
        subject,
        status: 'FAILED',
        error: msg.slice(0, 500),
      },
    })
    await logEvent('CRM', 'ERROR', `Fallo enviando re-engagement a ${lead.email}: ${msg.slice(0, 160)}`)
    return false
  }
}

/** Buzón con cupo para el CRM: verificado, activo y no al tope; prefiere el menos usado */
export async function pickCrmMailbox(): Promise<Mailbox | null> {
  const mbs = await db.mailbox.findMany({
    where: { verified: true, status: { in: ['WARMUP', 'ACTIVE'] } },
  })
  const candidates = mbs.filter((m) => m.sentCampaignToday < m.campaignDailyLimit)
  if (!candidates.length) return null
  return candidates.sort((a, b) => a.sentCampaignToday - b.sentCampaignToday)[0]
}

// ─── Acciones manuales desde la UI / MCP ─────────────────────────────
export async function manualChangeAngle(leadId: string, angleId: string): Promise<{ ok: boolean; message: string }> {
  const lead = await db.lead.findUnique({ where: { id: leadId } })
  const angle = await db.angle.findUnique({ where: { id: angleId } })
  if (!lead || !angle) return { ok: false, message: 'Lead o enfoque no encontrado' }
  if (lead.stage === 'RECHAZADO') return { ok: false, message: 'El lead está rechazado; recupéralo primero' }
  const s = await getSettings()
  const ok = await sendReengageEmail(lead, angle.subject, angle.body, s.signature, angle.name)
  if (!ok) return { ok: false, message: 'No se pudo enviar: revisa buzones y cuota diaria' }
  await db.lead.update({
    where: { id: lead.id },
    data: { reengagedCount: { increment: 1 }, lastReengageAt: new Date(), currentAngle: angle.name, stage: 'RECUPERADO', stageAt: new Date() },
  })
  await logLeadEvent(lead.id, 'ANGLE', `Cambio de enfoque manual: "${angle.name}"`, angle.subject)
  await logEvent('CRM', 'ACTION', `Cambio de enfoque manual → ${lead.email} con "${angle.name}"`, { leadId: lead.id, angleId: angle.id })
  return { ok: true, message: `Correo con el enfoque "${angle.name}" enviado a ${lead.email}` }
}

export async function manualAddToPromotion(leadId: string, campaignId: string): Promise<{ ok: boolean; message: string }> {
  const lead = await db.lead.findUnique({ where: { id: leadId } })
  const campaign: Campaign | null = await db.campaign.findUnique({ where: { id: campaignId } })
  if (!lead || !campaign) return { ok: false, message: 'Lead o campaña no encontrada' }
  const already = await db.enrollment.findFirst({ where: { campaignId, leadId } })
  if (already) return { ok: false, message: `${lead.email} ya está en "${campaign.name}"` }
  const mb = await pickCrmMailbox()
  if (!mb) return { ok: false, message: 'Sin buzón con cupo disponible hoy' }
  await db.enrollment.create({
    data: { campaignId, leadId, mailboxId: mb.id, status: 'QUEUED', nextSendAt: new Date(Date.now() + 30 * 60_000) },
  })
  await db.lead.update({
    where: { id: lead.id },
    data: { reengagedCount: { increment: 1 }, lastReengageAt: new Date(), stage: 'RECUPERADO', stageAt: new Date() },
  })
  await logLeadEvent(lead.id, 'PROMO', `Metido manualmente en la promoción "${campaign.name}"`, `Buzón ${mb.email}`)
  await logEvent('CRM', 'ACTION', `Lead ${lead.email} añadido manualmente a "${campaign.name}"`, { leadId: lead.id, campaignId })
  await notify('crm', `🎯 ${lead.name || lead.email} → "${campaign.name}"`, 'Añadido manualmente desde el CRM. Primer correo en ~30 min.')
  return { ok: true, message: `${lead.email} añadido a "${campaign.name}"` }
}

export async function manualResend(leadId: string): Promise<{ ok: boolean; message: string }> {
  const lead = await db.lead.findUnique({ where: { id: leadId } })
  if (!lead) return { ok: false, message: 'Lead no encontrado' }
  if (lead.stage === 'RECHAZADO') return { ok: false, message: 'El lead está rechazado; recupéralo primero' }
  const s = await getSettings()
  const ok = await resendLast({ id: 'manual', name: 're-envío manual' }, lead, s.signature)
  return ok
    ? { ok: true, message: `Re-envío enviado a ${lead.email}` }
    : { ok: false, message: 'No se pudo enviar: revisa buzones y cuota diaria' }
}

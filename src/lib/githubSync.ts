// ─────────────────────────────────────────────────────────────────────
// AliceMail v3.1 — Puente GitHub ↔ VM (sistema nervioso del ecosistema)
//
// La VM no tiene puertos abiertos: TODO el tráfico hacia GitHub es
// saliente (HTTPS). Este módulo convierte el repo privado `alice-data`
// en un bus de mensajería bidireccional:
//
//   VM ──push──▶ state.json          (dashboard en GitHub Pages)
//   VM ◀──poll── commands/pending    (consola web → la VM ejecuta)
//   VM ◀──poll── imports/*.csv       (carga de leads desde la web)
//   VM ◀──poll── mailboxes.json      (alta de buzones desde la web)
//   VM ──push──▶ commands/log-*.json (resultado de cada comando)
//
// Variables de entorno: GH_SYNC_TOKEN, GH_DATA_REPO (owner/name),
// GH_SYNC_BRANCH (def: main), GH_SYNC_MASK_EMAILS (def: true)
// ─────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { getSettings, todayKey } from '@/lib/settings'
import { getQuotaSummary } from '@/lib/quota'
import { agentCycle, logEvent } from '@/lib/agent'
import { crmPhase, setLeadStage, manualResend, manualChangeAngle, STAGES } from '@/lib/crm'
import { notify } from '@/lib/notify'
import { createHash, randomUUID } from 'crypto'

// ─── Configuración ───────────────────────────────────────────────────
function cfg() {
  const token = process.env.GH_SYNC_TOKEN || ''
  const repo = process.env.GH_DATA_REPO || ''
  return {
    token,
    repo,
    branch: process.env.GH_SYNC_BRANCH || 'main',
    mask: (process.env.GH_SYNC_MASK_EMAILS || 'true') !== 'false',
    enabled: Boolean(token && repo && repo.includes('/')),
    api: 'https://api.github.com',
  }
}

export interface SyncStatus {
  enabled: boolean
  repo: string
  lastPush: string | null
  lastPoll: string | null
  lastError: string | null
  commandsProcessed: number
  importsProcessed: number
}

const state: SyncStatus = {
  enabled: false,
  repo: '',
  lastPush: null,
  lastPoll: null,
  lastError: null,
  commandsProcessed: 0,
  importsProcessed: 0,
}

export function getSyncStatus(): SyncStatus {
  const c = cfg()
  return { ...state, enabled: c.enabled, repo: c.repo }
}

// ─── Cliente Contents API de GitHub ──────────────────────────────────
async function gh(path: string, init: RequestInit = {}): Promise<{ status: number; json: unknown }> {
  const c = cfg()
  const res = await fetch(`${c.api}/repos/${c.repo}/contents/${path}${path.includes('?') ? '' : `?ref=${c.branch}`}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

function b64encode(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
}

async function putFile(path: string, content: string, message: string): Promise<boolean> {
  const c = cfg()
  const get = await gh(path)
  const sha = (get.status === 200 && get.json && typeof get.json === 'object' && 'sha' in get.json)
    ? String((get.json as { sha?: string }).sha)
    : undefined
  const res = await gh(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: b64encode(content),
      branch: c.branch,
      ...(sha ? { sha } : {}),
    }),
  })
  return res.status === 200 || res.status === 201
}

async function getFile(path: string): Promise<string | null> {
  const get = await gh(path)
  if (get.status !== 200 || !get.json || typeof get.json !== 'object') return null
  const obj = get.json as { content?: string; encoding?: string }
  if (!obj.content) return null
  return Buffer.from(obj.content, obj.encoding === 'base64' ? 'base64' : 'utf-8').toString('utf-8')
}

async function deleteFile(path: string, message: string): Promise<boolean> {
  const get = await gh(path)
  if (get.status !== 200 || !get.json || typeof get.json !== 'object') return false
  const sha = (get.json as { sha?: string }).sha
  if (!sha) return false
  const res = await gh(path, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: cfg().branch }),
  })
  return res.status === 200
}

async function listDir(dir: string): Promise<{ name: string; path: string; type: string }[]> {
  const get = await gh(`${dir}?ref=${cfg().branch}`)
  if (get.status !== 200 || !Array.isArray(get.json)) return []
  return get.json as { name: string; path: string; type: string }[]
}

// ─── Utilidades ──────────────────────────────────────────────────────
function maskEmail(email: string): string {
  if (!cfg().mask) return email
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const head = local.slice(0, 1)
  return `${head}${'*'.repeat(Math.max(2, Math.min(5, local.length - 1)))}@${domain}`
}

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null
}

function ago(d: Date | null | undefined): string {
  if (!d) return '—'
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

/** Objetivo warmup del día (misma fórmula que worker.ts, copiada para evitar import circular) */
function warmupTarget(mb: { warmupStart: number; warmupRamp: number; warmupMax: number; warmupStartedAt: Date; penaltyUntil: Date | null; sentCampaignToday: number }): number {
  const days = Math.floor((Date.now() - new Date(mb.warmupStartedAt).getTime()) / 86_400_000)
  let t = Math.min(mb.warmupStart + mb.warmupRamp * days, mb.warmupMax)
  if (mb.penaltyUntil && new Date(mb.penaltyUntil) > new Date()) t = Math.max(1, Math.round(t * 0.75))
  if (mb.sentCampaignToday > 0) t = Math.min(t, 5)
  return t
}

// ─── Snapshot de estado → state.json ─────────────────────────────────
export async function buildSnapshot(): Promise<Record<string, unknown>> {
  const settings = await getSettings()
  const quota = await getQuotaSummary()
  const startDay = new Date(new Date().setHours(0, 0, 0, 0))

  const [mailboxes, leadsTotal, stageGroups, tempGroups, campaigns, agentEvents, leadEvents, notifications, opensToday, repliesToday, bouncesToday, inboxPending] =
    await Promise.all([
      db.mailbox.findMany({ orderBy: { email: 'asc' } }),
      db.lead.count(),
      db.lead.groupBy({ by: ['stage'], _count: true }),
      db.lead.groupBy({ by: ['temperature'], _count: true }),
      db.campaign.findMany({ include: { _count: { select: { enrollments: true, steps: true } } }, orderBy: { createdAt: 'desc' } }),
      db.agentEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
      db.leadEvent.findMany({ where: { type: { in: ['STAGE', 'REENGAGE', 'ANGLE', 'REPLY', 'BOUNCE'] } }, orderBy: { createdAt: 'desc' }, take: 30, include: { lead: { select: { email: true } } } }),
      db.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
      db.send.count({ where: { openedAt: { not: null }, sentAt: { gte: startDay } } }),
      db.send.count({ where: { kind: 'CAMPAIGN', status: 'SENT', sentAt: { gte: startDay }, lead: { status: 'REPLIED' } } }),
      db.send.count({ where: { status: 'BOUNCED', sentAt: { gte: startDay } } }),
      db.inboxMessage.count({ where: { classified: false } }),
    ])

  const byStage: Record<string, number> = {}
  for (const st of STAGES) byStage[st] = 0
  for (const g of stageGroups) byStage[g.stage] = g._count
  const byTemp: Record<string, number> = { HOT: 0, WARM: 0, COLD: 0 }
  for (const g of tempGroups) byTemp[g.temperature] = g._count

  const sync = getSyncStatus()

  return {
    app: 'alicemail',
    version: '3.1.0',
    generatedAt: new Date().toISOString(),
    engine: {
      workerEnabled: settings.workerEnabled,
      window: `${settings.windowStart}:00–${settings.windowEnd}:00`,
      agentEnabled: settings.agentEnabled,
      agentAutonomy: settings.agentAutonomy,
      dailyCapGlobal: settings.dailyCapGlobal,
    },
    quota: {
      campaignCap: quota.campaignCap,
      campaignSentToday: quota.campaignSentToday,
      campaignRemaining: quota.campaignRemaining,
      warmupToday: quota.warmupToday,
      totalToday: quota.totalToday,
      byMailbox: quota.byMailbox.map((m) => ({ ...m, email: maskEmail(m.email) })),
    },
    kpi: {
      leadsTotal,
      byStage,
      byTemp,
      opensToday,
      repliesToday,
      bouncesToday,
      inboxPending,
    },
    mailboxes: mailboxes.map((mb) => ({
      email: maskEmail(mb.email),
      displayName: mb.displayName,
      provider: mb.provider,
      status: mb.status,
      verified: mb.verified,
      campaignDailyLimit: mb.campaignDailyLimit,
      sentCampaignToday: mb.sentCampaignToday,
      sentWarmupToday: mb.sentWarmupToday,
      warmupTarget: warmupTarget(mb),
      penaltyUntil: iso(mb.penaltyUntil),
      lastError: mb.lastError,
    })),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      fromName: c.fromName,
      status: c.status,
      dailyTarget: c.dailyTarget,
      steps: c._count.steps,
      enrollments: c._count.enrollments,
    })),
    agent: {
      enabled: settings.agentEnabled,
      autonomy: settings.agentAutonomy,
      events: agentEvents.map((e) => ({
        level: e.level,
        type: e.type,
        message: e.message,
        at: iso(e.createdAt),
      })),
    },
    crm: {
      recentMoves: leadEvents.map((ev) => ({
        type: ev.type,
        title: ev.title,
        detail: ev.detail,
        lead: ev.lead ? maskEmail(ev.lead.email) : null,
        at: iso(ev.createdAt),
      })),
    },
    notifications: notifications.map((n) => ({
      channel: n.channel,
      event: n.event,
      title: n.title,
      status: n.status,
      at: iso(n.createdAt),
    })),
    sync: {
      lastPush: state.lastPush,
      lastPoll: state.lastPoll,
      lastError: state.lastError,
      commandsProcessed: state.commandsProcessed,
      importsProcessed: state.importsProcessed,
      maskEmails: cfg().mask,
    },
  }
}

// ─── Importación de leads desde CSV ──────────────────────────────────
function parseCsv(text: string): { email: string; name?: string; company?: string; position?: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const sep = [',', ';', '\t'].sort((a, b) => (lines[0].split(b).length - lines[0].split(a).length))[0] || ','
  const split = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === sep && !inQ) {
        out.push(cur.trim())
        cur = ''
      } else cur += ch
    }
    out.push(cur.trim())
    return out
  }
  const header = split(lines[0]).map((h) => h.toLowerCase())
  const emailIdx = header.findIndex((h) => h === 'email' || h === 'correo' || h === 'e-mail')
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'nombre')
  const companyIdx = header.findIndex((h) => h === 'company' || h === 'empresa')
  const positionIdx = header.findIndex((h) => h === 'position' || h === 'cargo' || h === 'titulo')
  const rows: { email: string; name?: string; company?: string; position?: string }[] = []
  for (let i = emailIdx >= 0 ? 1 : 0; i < lines.length; i++) {
    const cols = split(lines[i])
    const email = (emailIdx >= 0 ? cols[emailIdx] : cols.find((c) => /@/.test(c)) || '').toLowerCase().trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue
    rows.push({
      email,
      name: nameIdx >= 0 ? cols[nameIdx] || undefined : undefined,
      company: companyIdx >= 0 ? cols[companyIdx] || undefined : undefined,
      position: positionIdx >= 0 ? cols[positionIdx] || undefined : undefined,
    })
  }
  return rows
}

async function importLeadsCsv(csv: string, sourceLabel: string): Promise<{ created: number; duplicates: number; invalid: number }> {
  const rows = parseCsv(csv)
  let created = 0
  let duplicates = 0
  let invalid = 0
  for (const r of rows) {
    const exists = await db.lead.findUnique({ where: { email: r.email } })
    if (exists) {
      duplicates++
      continue
    }
    const lead = await db.lead.create({
      data: {
        email: r.email,
        name: r.name || null,
        company: r.company || null,
        position: r.position || null,
        source: 'github',
        unsubToken: createHash('sha256').update(r.email + randomUUID()).digest('hex').slice(0, 24),
      },
    })
    await db.leadEvent.create({
      data: { leadId: lead.id, type: 'IMPORT', title: 'Lead importado', detail: sourceLabel },
    })
    created++
  }
  return { created, duplicates, invalid: rows.length - created - duplicates }
}

// ─── Dispatcher de comandos (consola web y futuro canal externo) ─────
export interface CommandResult {
  cmd: string
  args: string[]
  ok: boolean
  output: string
}

async function runCommand(cmd: string, args: string[]): Promise<CommandResult> {
  const A = (i: number) => (args[i] || '').trim()
  try {
    switch ((cmd || '').toLowerCase()) {
      case 'estado': {
        const snap = (await buildSnapshot()) as {
          kpi: Record<string, unknown>
          engine: Record<string, unknown>
          quota: Record<string, unknown>
        }
        const k = snap.kpi as Record<string, number>
        const q = snap.quota as Record<string, number>
        const e = snap.engine as Record<string, unknown>
        return {
          cmd, args, ok: true,
          output: [
            `⚙️ Motor: ${e.workerEnabled ? 'ACTIVO' : 'PAUSADO'} · ventana ${e.window} · agente ${e.agentAutonomy}`,
            `📬 Hoy: campaña ${q.campaignSentToday}/${q.campaignCap} · warmup ${q.warmupToday} · total ${q.totalToday}`,
            `🧊🔥 Leads: ${k.leadsTotal} (calientes ${k.byStage?.CALIENTE ?? 0} · fríos ${k.byStage?.FRIO ?? 0} · rechazados ${k.byStage?.RECHAZADO ?? 0})`,
            `👀 Aperturas hoy: ${k.opensToday} · respuestas: ${k.repliesToday} · rebotes: ${k.bouncesToday}`,
          ].join('\n'),
        }
      }
      case 'cuota': {
        const q = await getQuotaSummary()
        const lines = q.byMailbox.map((m) => `• ${maskEmail(m.email)}: campaña ${m.campaignSent}/${m.campaignLimit} · warmup ${m.warmupSent}/${m.warmupTarget}`)
        return { cmd, args, ok: true, output: [`📊 Tope global hoy: ${q.campaignSentToday}/${q.campaignCap} (restan ${q.campaignRemaining})`, ...lines].join('\n') }
      }
      case 'pausar': {
        await saveSetting('workerEnabled', 'false')
        await logEvent('SYSTEM', 'ACTION', 'Motor pausado por comando remoto')
        await notify('error', '⏸️ Motor pausado', 'El motor de envío fue pausado mediante un comando remoto.')
        return { cmd, args, ok: true, output: 'Motor PAUSADO. Ningún correo saldrá hasta reanudar.' }
      }
      case 'reanudar': {
        await saveSetting('workerEnabled', 'true')
        await logEvent('SYSTEM', 'ACTION', 'Motor reanudado por comando remoto')
        await notify('daily', '▶️ Motor reanudado', 'El motor de envío vuelve a estar activo.')
        return { cmd, args, ok: true, output: 'Motor ACTIVO de nuevo.' }
      }
      case 'leads': {
        const stage = A(0).toUpperCase() ? A(0).toUpperCase() : ''
        const where = stage && STAGES.includes(stage as never) ? { stage } : {}
        const leads = await db.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 15 })
        return {
          cmd, args, ok: true,
          output: leads.length
            ? [`📋 ${leads.length} leads${stage ? ` (${stage})` : ''}:`, ...leads.map((l) => `• ${maskEmail(l.email)} — ${l.stage} · ${l.temperature} · score ${l.score}`)].join('\n')
            : 'Sin leads en esa etapa.',
        }
      }
      case 'lead': {
        const email = A(0).toLowerCase()
        const lead = await db.lead.findFirst({ where: { email }, include: { events: { orderBy: { createdAt: 'desc' }, take: 8 } } })
        if (!lead) return { cmd, args, ok: false, output: `No existe el lead ${maskEmail(email)}` }
        return {
          cmd, args, ok: true,
          output: [
            `👤 ${maskEmail(lead.email)} (${lead.name || 'sin nombre'})`,
            `Etapa: ${lead.stage} · Temperatura: ${lead.temperature} · Score: ${lead.score}`,
            `Aperturas: ${lead.openCount} · Re-engages: ${lead.reengagedCount} · Enfoque: ${lead.currentAngle || '—'}`,
            'Timeline:',
            ...lead.events.map((ev) => `• [${ev.type}] ${ev.title}${ev.detail ? ` — ${ev.detail}` : ''} (${ago(ev.createdAt)})`),
          ].join('\n'),
        }
      }
      case 'agente': {
        const r = await agentCycle(true)
        return { cmd, args, ok: true, output: `🤖 Ciclo del agente ejecutado: ${r.classified} clasificados · ${r.hot} calientes · ${r.autoReplies} respuestas · ${r.guards} guardianes · CRM(reenvío ${r.crm.resend}/enfoque ${r.crm.angleChange}/promo ${r.crm.promoAdded}).` }
      }
      case 'crm': {
        const r = await crmPhase(true)
        return { cmd, args, ok: true, output: `🔄 Fase CRM ejecutada: ${r.angleChange} cambio enfoque · ${r.promoAdded} nueva promo · ${r.resend} reenvíos (${r.skipped} omitidos).` }
      }
      case 'reenviar': {
        const lead = await db.lead.findFirst({ where: { email: A(0).toLowerCase() } })
        if (!lead) return { cmd, args, ok: false, output: `Lead no encontrado: ${maskEmail(A(0))}` }
        const r = await manualResend(lead.id)
        return { cmd, args, ok: r.ok, output: r.message }
      }
      case 'enfoque': {
        const lead = await db.lead.findFirst({ where: { email: A(0).toLowerCase() } })
        if (!lead) return { cmd, args, ok: false, output: `Lead no encontrado: ${maskEmail(A(0))}` }
        const angle = await db.angle.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } })
        if (!angle) return { cmd, args, ok: false, output: 'No hay enfoques activos. Créalos en el panel → Automatización.' }
        const r = await manualChangeAngle(lead.id, angle.id)
        return { cmd, args, ok: r.ok, output: r.message }
      }
      case 'etapa': {
        const lead = await db.lead.findFirst({ where: { email: A(0).toLowerCase() } })
        if (!lead) return { cmd, args, ok: false, output: `Lead no encontrado: ${maskEmail(A(0))}` }
        const stage = A(1).toUpperCase()
        if (!STAGES.includes(stage as never)) return { cmd, args, ok: false, output: `Etapa inválida. Usa: ${STAGES.join(', ')}` }
        await setLeadStage(lead.id, stage, 'Cambio manual por comando remoto')
        return { cmd, args, ok: true, output: `${maskEmail(lead.email)} → ${stage}` }
      }
      case 'importar': {
        const r = await processImports()
        return { cmd, args, ok: true, output: r.processed ? `📥 ${r.processed} archivo(s) procesados: ${r.summary}` : 'No hay CSV pendientes en imports/.' }
      }
      case 'ayuda':
      default:
        return {
          cmd, args, ok: cmd === 'ayuda',
          output: [
            'Comandos disponibles:',
            '• estado — resumen general del motor y leads',
            '• cuota — cupo diario por buzón',
            '• pausar / reanudar — motor de envío',
            '• leads [ETAPA] — lista leads (CALIENTE, FRIO, RECHAZADO…)',
            '• lead <email> — ficha y timeline',
            '• agente — fuerza un ciclo del agente IA',
            '• crm — fuerza la fase de re-engagement',
            '• reenviar <email> — reenvío manual',
            '• enfoque <email> — cambia el enfoque del lead',
            '• etapa <email> <ETAPA> — mueve el lead de etapa',
            '• importar — procesa CSVs pendientes en imports/',
            '• ayuda — esta lista',
          ].join('\n'),
        }
    }
  } catch (err) {
    return { cmd, args, ok: false, output: `Error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function saveSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

// ─── Poll de comandos remotos ────────────────────────────────────────
interface PendingCommand {
  id: string
  cmd: string
  args?: string[]
  source?: string
  ts?: string
}

async function pollCommands(): Promise<number> {
  const raw = await getFile('commands/pending.json')
  if (!raw) return 0
  let list: PendingCommand[] = []
  try {
    const parsed = JSON.parse(raw) as { commands?: PendingCommand[] }
    list = Array.isArray(parsed.commands) ? parsed.commands : []
  } catch {
    list = []
  }
  if (!list.length) return 0

  const logPath = `commands/log-${todayKey()}.json`
  const existingRaw = await getFile(logPath)
  let logEntries: unknown[] = []
  try {
    logEntries = existingRaw ? (JSON.parse(existingRaw) as unknown[]) : []
  } catch {
    logEntries = []
  }

  for (const c of list) {
    const result = await runCommand(c.cmd, c.args || [])
    logEntries.push({ ...c, ...result, at: new Date().toISOString() })
    state.commandsProcessed++
    await logEvent('SYSTEM', 'ACTION', `Comando remoto "${c.cmd}" ejecutado (vía ${c.source || 'web'})`)
  }
  await putFile(logPath, JSON.stringify(logEntries.slice(-200), null, 2), `alicemail: log de comandos ${todayKey()}`)
  await deleteFile('commands/pending.json', 'alicemail: comandos procesados')
  return list.length
}

// ─── Poll de importaciones CSV ───────────────────────────────────────
async function processImports(): Promise<{ processed: number; summary: string }> {
  const files = await listDir('imports')
  const csvs = files.filter((f) => f.type === 'file' && /\.csv$/i.test(f.name))
  if (!csvs.length) return { processed: 0, summary: '' }
  const summaries: string[] = []
  for (const f of csvs) {
    const content = await getFile(f.path)
    if (content === null) continue
    const r = await importLeadsCsv(content, `Importación ${f.name}`)
    summaries.push(`${f.name}: +${r.created} nuevos, ${r.duplicates} duplicados`)
    await putFile(
      `imports/processed/${f.name}`,
      content,
      `alicemail: ${f.name} procesado (+${r.created} leads)`
    )
    await deleteFile(f.path, `alicemail: mueve ${f.name} a processed`)
    state.importsProcessed++
    if (r.created > 0) {
      await notify('daily', '📥 Leads importados', `${r.created} leads nuevos desde ${f.name} (${r.duplicates} duplicados omitidos).`)
    }
  }
  return { processed: csvs.length, summary: summaries.join(' · ') }
}

// ─── Poll de mailboxes.json (alta de buzones desde la web) ───────────
interface MailboxSpec {
  email: string
  displayName?: string
  provider?: string
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPass?: string
  imapHost?: string
  imapPort?: number
  imapUser?: string
  imapPass?: string
  campaignDailyLimit?: number
  verified?: boolean
}

async function pollMailboxes(): Promise<number> {
  const raw = await getFile('mailboxes.json')
  if (!raw) return 0
  let specs: MailboxSpec[] = []
  try {
    specs = JSON.parse(raw) as MailboxSpec[]
  } catch {
    return 0
  }
  if (!Array.isArray(specs)) return 0
  let touched = 0
  for (const s of specs) {
    const email = (s.email || '').toLowerCase().trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue
    const exists = await db.mailbox.findUnique({ where: { email } })
    if (exists) continue
    await db.mailbox.create({
      data: {
        email,
        displayName: s.displayName || email.split('@')[0],
        provider: (s.provider || 'SMTP').toUpperCase(),
        smtpHost: s.smtpHost || '',
        smtpPort: s.smtpPort || 465,
        smtpUser: s.smtpUser || email,
        smtpPass: s.smtpPass || '',
        imapHost: s.imapHost || '',
        imapPort: s.imapPort || 993,
        imapUser: s.imapUser || email,
        imapPass: s.imapPass || '',
        campaignDailyLimit: s.campaignDailyLimit || 20,
        verified: Boolean(s.verified),
      },
    })
    touched++
    await logEvent('SYSTEM', 'ACTION', `Buzón ${maskEmail(email)} dado de alta vía mailboxes.json`)
  }
  return touched
}

// ─── Ciclo principal de sincronización ───────────────────────────────
const PUSH_INTERVAL_MS = 4 * 60 * 1000 // push de estado máx cada 4 min
let lastPushAt = 0
let syncing = false

export async function syncCycle(force = false): Promise<{ ok: boolean; skipped?: string; pushed?: boolean; commands?: number; imports?: number; mailboxes?: number }> {
  const c = cfg()
  if (!c.enabled) return { ok: false, skipped: 'GH_SYNC_TOKEN/GH_DATA_REPO no configurados' }
  if (syncing) return { ok: false, skipped: 'sync en curso' }
  syncing = true
  try {
    // 1) comandos remotos
    const commands = await pollCommands()
    // 2) importaciones CSV
    const imp = await processImports()
    // 3) alta de buzones
    const mailboxes = await pollMailboxes()
    state.lastPoll = new Date().toISOString()
    // 4) push de estado (con throttle salvo force)
    let pushed = false
    if (force || Date.now() - lastPushAt > PUSH_INTERVAL_MS) {
      const snapshot = await buildSnapshot()
      pushed = await putFile('state.json', JSON.stringify(snapshot, null, 2), `alicemail: estado ${new Date().toISOString().slice(0, 16)}`)
      if (pushed) lastPushAt = Date.now()
    }
    state.lastPush = state.lastPush || (pushed ? new Date().toISOString() : null)
    state.lastError = null
    return { ok: true, pushed, commands, imports: imp.processed, mailboxes }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    state.lastError = msg.slice(0, 300)
    await logEvent('SYSTEM', 'ERROR', `Sync GitHub falló: ${msg.slice(0, 200)}`)
    return { ok: false, skipped: msg.slice(0, 200) }
  } finally {
    syncing = false
  }
}

/** Ejecución manual inmediata (API /api/sync POST) */
export async function runSyncNow(): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const c = cfg()
  if (!c.enabled) return { ok: false, error: 'Configura GH_SYNC_TOKEN y GH_DATA_REPO en el entorno del servidor' }
  const r = await syncCycle(true)
  return { ok: r.ok, result: r }
}

// ─────────────────────────────────────────────────────────────────────
// AliceMail — Servidor MCP (Model Context Protocol) sobre HTTP JSON-RPC 2.0
// Endpoint: POST /api/mcp  (Bearer token o ?token=)
// Permite que Claude Desktop, Cursor u otro cliente MCP controle y consulte
// la plataforma: estado, buzones, leads, bandeja, clasificar, responder…
// ─────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { getSettings, ensureMcpToken } from '@/lib/settings'
import { safeEqual } from '@/lib/crypto'
import { getQuotaSummary } from '@/lib/quota'
import { agentCycle, sendAgentReply, logEvent } from '@/lib/agent'
import { classifyReply } from '@/lib/ai'
import { applyReplyClassification, setLeadStage, manualChangeAngle, manualAddToPromotion, manualResend, STAGES, STAGE_LABEL, type Stage } from '@/lib/crm'

export const MCP_PROTOCOL_VERSION = '2024-11-05'
export const MCP_SERVER_INFO = { name: 'alicemail-mcp', version: '3.0.0' }

interface JsonRpcRequest {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  {
    name: 'get_status',
    description: 'Estado completo de AliceMail: envíos de hoy, cuota restante, temperaturas de leads, buzones por estado',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_mailboxes',
    description: 'Lista los buzones con su estado, warmup y límites',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_leads',
    description: 'Lista leads filtrando por temperatura (HOT/WARM/COLD) o estado',
    inputSchema: {
      type: 'object',
      properties: {
        temperature: { type: 'string', enum: ['HOT', 'WARM', 'COLD'] },
        status: { type: 'string' },
        limit: { type: 'number', default: 25 },
      },
    },
  },
  {
    name: 'get_inbox',
    description: 'Mensajes entrantes; filter=unclassified devuelve respuestas aún sin clasificar por el agente',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['all', 'unclassified', 'replies', 'bounces'], default: 'all' },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'classify_message',
    description: 'Fuerza la clasificación IA de un mensaje de la bandeja (caliente/tibio/frío/OOO + borrador de respuesta)',
    inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] },
  },
  {
    name: 'send_reply',
    description: 'Envía la respuesta a un mensaje recibido: usa el borrador del agente o un texto propio',
    inputSchema: {
      type: 'object',
      properties: { messageId: { type: 'string' }, body: { type: 'string', description: 'opcional; si se omite usa el borrador del agente' } },
      required: ['messageId'],
    },
  },
  {
    name: 'set_campaign_status',
    description: 'Pausa (PAUSED) o reanuda (RUNNING) una campaña',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, status: { type: 'string', enum: ['RUNNING', 'PAUSED'] } },
      required: ['id', 'status'],
    },
  },
  {
    name: 'set_mailbox_status',
    description: 'Pausa (PAUSED) o reactiva (WARMUP/ACTIVE) un buzón',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, status: { type: 'string', enum: ['WARMUP', 'ACTIVE', 'PAUSED'] } },
      required: ['id', 'status'],
    },
  },
  {
    name: 'add_lead',
    description: 'Añade un lead nuevo (email obligatorio, nombre/empresa opcionales)',
    inputSchema: {
      type: 'object',
      properties: { email: { type: 'string' }, name: { type: 'string' }, company: { type: 'string' } },
      required: ['email'],
    },
  },
  {
    name: 'run_agent',
    description: 'Ejecuta un ciclo del agente IA ahora (clasificar pendientes, guardianes, informe)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_agent_events',
    description: 'Últimos eventos del agente (decisiones, acciones, alertas)',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 30 } } },
  },
  {
    name: 'crm_pipeline',
    description: 'Embudo CRM: leads por etapa (nuevo, en contacto, caliente, tibio, frío, rechazado, recuperado) y últimos re-engagements',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_lead_stage',
    description: 'Mueve un lead de etapa en el CRM (NUEVO, CONTACTADO, CALIENTE, TIBIO, FRIO, RECHAZADO, RECUPERADO)',
    inputSchema: {
      type: 'object',
      properties: { leadId: { type: 'string' }, email: { type: 'string' }, stage: { type: 'string', enum: STAGES as unknown as string[] } },
      required: ['stage'],
    },
  },
  {
    name: 'reengage_lead',
    description: 'Re-activa un lead ahora: RESEND (re-envío), CHANGE_ANGLE (cambia de enfoque usando un enfoque activo) o NEW_PROMO (lo mete en otra promoción/campaña)',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        email: { type: 'string' },
        action: { type: 'string', enum: ['RESEND', 'CHANGE_ANGLE', 'NEW_PROMO'] },
        angleId: { type: 'string', description: 'obligatorio si action=CHANGE_ANGLE' },
        campaignId: { type: 'string', description: 'obligatorio si action=NEW_PROMO' },
      },
      required: ['action'],
    },
  },
]

/** Punto de entrada JSON-RPC 2.0 — TODO método exige token válido */
export async function handleMcpRpc(body: JsonRpcRequest, tokenOk: boolean): Promise<Record<string, unknown>> {
  const { id, method, params } = body
  const result = (fn: () => Promise<unknown> | unknown) =>
    Promise.resolve(fn()).then((r) => ({ jsonrpc: '2.0', id, result: r as object }))

  if (!tokenOk) return err(id, -32001, 'Token MCP inválido o ausente')

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: MCP_SERVER_INFO,
      },
    }
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} }
  if (method === 'notifications/initialized') return { jsonrpc: '2.0', id: null, result: {} }

  if (method === 'tools/list') {
    return result(() => ({ tools: TOOLS }))
  }
  if (method === 'tools/call') {
    const name = String(params?.name || '')
    const args = (params?.arguments || {}) as Record<string, unknown>
    if (!tokenOk) return err(id, -32001, 'Token MCP inválido o ausente')
    try {
      const out = await callTool(name, args)
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] } }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `ERROR: ${msg}` }], isError: true } }
    }
  }
  return err(id, -32601, `Método desconocido: ${method}`)
}

function err(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_status': {
      const quota = await getQuotaSummary()
      const [temps, mbStatus, unclassified] = await Promise.all([
        db.lead.groupBy({ by: ['temperature'], _count: true }),
        db.mailbox.groupBy({ by: ['status'], _count: true }),
        db.inboxMessage.count({ where: { isReply: true, classified: false } }),
      ])
      return {
        today: {
          campaign: quota.campaignSentToday,
          warmup: quota.warmupToday,
          total: quota.totalToday,
          cap: quota.campaignCap,
          remaining: quota.campaignRemaining,
        },
        temperatures: Object.fromEntries(temps.map((t) => [t.temperature, t._count])),
        mailboxes: Object.fromEntries(mbStatus.map((m) => [m.status, m._count])),
        inboxUnclassified: unclassified,
      }
    }
    case 'list_mailboxes':
      return (await db.mailbox.findMany()).map((m) => ({
        id: m.id,
        email: m.email,
        displayName: m.displayName,
        provider: m.provider,
        verified: m.verified,
        status: m.status,
        warmupToday: m.sentWarmupToday,
        warmupMax: m.warmupMax,
        campaignToday: m.sentCampaignToday,
        campaignLimit: m.campaignDailyLimit,
        penaltyUntil: m.penaltyUntil,
        lastError: m.lastError,
      }))
    case 'list_leads': {
      const where: Record<string, unknown> = {}
      if (args.temperature) where.temperature = args.temperature
      if (args.status) where.status = args.status
      const limit = clampInt(args.limit, 1, 200, 25)
      const leads = await db.lead.findMany({ where, orderBy: { temperatureAt: 'desc' }, take: limit })
      return leads.map((l) => ({
        id: l.id,
        email: l.email,
        name: l.name,
        company: l.company,
        status: l.status,
        temperature: l.temperature,
        aiNotes: l.aiNotes,
        lastContactedAt: l.lastContactedAt,
      }))
    }
    case 'get_inbox': {
      const filter = String(args.filter || 'all')
      const where: Record<string, unknown> = {}
      if (filter === 'unclassified') where.classified = false
      if (filter === 'replies') where.isReply = true
      if (filter === 'bounces') where.isBounce = true
      const limit = clampInt(args.limit, 1, 100, 20)
      const msgs = await db.inboxMessage.findMany({ where, orderBy: { receivedAt: 'desc' }, take: limit, include: { mailbox: true } })
      return msgs.map((m) => ({
        id: m.id,
        from: m.fromEmail,
        subject: m.subject,
        summary: m.aiSummary,
        temperature: m.temperature,
        intent: m.aiIntent,
        draft: m.aiReply,
        classified: m.classified,
        isBounce: m.isBounce,
        receivedAt: m.receivedAt,
        mailbox: m.mailbox.email,
      }))
    }
    case 'classify_message': {
      const msg = await db.inboxMessage.findUnique({ where: { id: String(args.messageId) } })
      if (!msg) throw new Error('Mensaje no encontrado')
      const r = await classifyReply({ from: msg.fromEmail, subject: msg.subject, body: msg.body })
      await db.inboxMessage.update({
        where: { id: msg.id },
        data: { temperature: r.temperature, aiIntent: r.intent, aiSummary: r.summary, aiReply: r.reply, classified: true },
      })
      const lead = await db.lead.findFirst({ where: { email: msg.fromEmail } })
      if (lead && r.temperature !== 'OOO') {
        await applyReplyClassification(lead, r, r.intent)
      }
      await logEvent('CLASSIFY', 'INFO', `MCP clasificó mensaje de ${msg.fromEmail} como ${r.temperature}`, { messageId: msg.id })
      return { messageId: msg.id, temperature: r.temperature, intent: r.intent, summary: r.summary, draft: r.reply, source: r.source }
    }
    case 'send_reply': {
      const msg = await db.inboxMessage.findUnique({ where: { id: String(args.messageId) } })
      if (!msg) throw new Error('Mensaje no encontrado')
      const body = args.body ? String(args.body) : msg.aiReply
      if (!body) throw new Error('No hay borrador ni texto proporcionado')
      const ok = await sendAgentReply(msg, body, 'ASSIST')
      return { sent: ok, to: msg.fromEmail }
    }
    case 'set_campaign_status': {
      const c = await db.campaign.update({
        where: { id: String(args.id) },
        data: { status: String(args.status) },
      })
      await logEvent('ACTION', 'ACTION', `MCP cambió campaña "${c.name}" a ${c.status}`, { campaignId: c.id })
      return { id: c.id, status: c.status }
    }
    case 'set_mailbox_status': {
      const m = await db.mailbox.update({
        where: { id: String(args.id) },
        data: { status: String(args.status), consecutiveErrors: 0 },
      })
      await logEvent('ACTION', 'ACTION', `MCP cambió buzón ${m.email} a ${m.status}`, { mailboxId: m.id })
      return { id: m.id, email: m.email, status: m.status }
    }
    case 'add_lead': {
      const email = String(args.email || '').toLowerCase().trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email inválido')
      const l = await db.lead.upsert({
        where: { email },
        update: { name: args.name ? String(args.name) : undefined, company: args.company ? String(args.company) : undefined },
        create: { email, name: args.name ? String(args.name) : null, company: args.company ? String(args.company) : null, source: 'mcp' },
      })
      return { id: l.id, email: l.email, created: true }
    }
    case 'run_agent': {
      const r = await agentCycle(true)
      return r
    }
    case 'get_agent_events': {
      const limit = clampInt(args.limit, 1, 200, 30)
      const evs = await db.agentEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
      return evs.map((e) => ({ id: e.id, type: e.type, level: e.level, message: e.message, at: e.createdAt }))
    }
    case 'crm_pipeline': {
      const groups = await db.lead.groupBy({ by: ['stage'], _count: true })
      const byStage: Record<string, number> = {}
      for (const st of STAGES) byStage[st] = 0
      for (const g of groups) byStage[g.stage] = g._count
      const hot = await db.lead.findMany({ where: { stage: 'CALIENTE' }, take: 10 })
      const reengage = await db.leadEvent.findMany({
        where: { type: { in: ['REENGAGE', 'ANGLE', 'PROMO'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      return {
        stages: Object.fromEntries(Object.entries(byStage).map(([k, v]) => [STAGE_LABEL[k as Stage], v])),
        hotLeads: hot.map((l) => ({ id: l.id, email: l.email, name: l.name, score: l.score })),
        recentReengagement: reengage.map((e) => ({ leadId: e.leadId, title: e.title, at: e.createdAt })),
      }
    }
    case 'set_lead_stage': {
      const stage = String(args.stage || '')
      if (!STAGES.includes(stage as Stage)) throw new Error(`Etapa inválida: ${stage}`)
      const lead = args.leadId
        ? await db.lead.findUnique({ where: { id: String(args.leadId) } })
        : args.email
          ? await db.lead.findUnique({ where: { email: String(args.email).toLowerCase() } })
          : null
      if (!lead) throw new Error('Lead no encontrado (usa leadId o email)')
      const updated = await setLeadStage(lead, stage as Stage, { source: 'MCP' })
      return { id: updated.id, email: updated.email, stage: updated.stage, stageLabel: STAGE_LABEL[updated.stage as Stage] }
    }
    case 'reengage_lead': {
      const lead = args.leadId
        ? await db.lead.findUnique({ where: { id: String(args.leadId) } })
        : args.email
          ? await db.lead.findUnique({ where: { email: String(args.email).toLowerCase() } })
          : null
      if (!lead) throw new Error('Lead no encontrado (usa leadId o email)')
      const action = String(args.action || '')
      if (action === 'RESEND') {
        const r = await manualResend(lead.id)
        return r
      }
      if (action === 'CHANGE_ANGLE') {
        if (!args.angleId) throw new Error('Falta angleId (mira los enfoques con la herramienta list_angles o desde la app)')
        return manualChangeAngle(lead.id, String(args.angleId))
      }
      if (action === 'NEW_PROMO') {
        if (!args.campaignId) throw new Error('Falta campaignId')
        return manualAddToPromotion(lead.id, String(args.campaignId))
      }
      throw new Error(`Acción desconocida: ${action}`)
    }
    default:
      throw new Error(`Herramienta desconocida: ${name}`)
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.floor(v) : parseInt(String(v ?? ''), 10)
  if (isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Límite simple en memoria: 120 llamadas por IP y minuto */
const mcpCalls = new Map<string, { n: number; reset: number }>()

function mcpRateLimited(ip: string): boolean {
  const now = Date.now()
  const c = mcpCalls.get(ip)
  if (!c || c.reset < now) {
    mcpCalls.set(ip, { n: 1, reset: now + 60_000 })
    return false
  }
  c.n += 1
  return c.n > 120
}

/** Verifica el token de la petición (Bearer header o query param) */
export async function verifyMcpToken(
  req: Request
): Promise<{ ok: boolean; token: string; limited: boolean }> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  if (mcpRateLimited(ip)) return { ok: false, token: '', limited: true }
  const url = new URL(req.url)
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || ''
  const token = await ensureMcpToken()
  // Comparación en tiempo constante (evita filtrado por temporización)
  const ok = provided.length > 0 && safeEqual(provided, token)
  return { ok, token, limited: false }
}

export async function mcpServerInfo(): Promise<{ endpoint: string; token: string; tools: ToolDef[] }> {
  const token = await ensureMcpToken()
  return { endpoint: '/api/mcp', token, tools: TOOLS }
}

// Ajustes globales con valores por defecto
import { db } from '@/lib/db'

export interface AppSettings {
  workerEnabled: boolean
  windowStart: number // hora local inicio ventana de envío
  windowEnd: number // hora local fin ventana de envío
  trackingUrl: string // URL pública base (p.ej. https://mail.techdigital.site)
  signature: string
  // ─── Agente IA ───
  agentEnabled: boolean
  agentAutonomy: 'OBSERVE' | 'ASSIST' | 'AUTO'
  // ─── Cuota global diaria de campaña ───
  dailyCapGlobal: number
  // ─── Notificaciones ───
  notifyChannel: 'OFF' | 'TELEGRAM' | 'WHATSAPP' | 'BOTH'
  notifyTelegramToken: string
  notifyTelegramChat: string
  notifyWaPhoneId: string
  notifyWaToken: string
  notifyWaTo: string
  notifyEvents: string // csv: reply,hot,bounce,error,daily
  dailyReportHour: number
  // ─── Motor IA (endpoint OpenAI-compatible opcional, para la VM) ───
  aiApiUrl: string
  aiApiKey: string
  aiModel: string
  // ─── MCP ───
  mcpToken: string
}

const DEFAULTS: Omit<AppSettings, 'windowStart' | 'windowEnd'> = {
  workerEnabled: true,
  trackingUrl: '',
  signature: '',
  agentEnabled: true,
  agentAutonomy: 'AUTO',
  dailyCapGlobal: 200,
  notifyChannel: 'OFF',
  notifyTelegramToken: '',
  notifyTelegramChat: '',
  notifyWaPhoneId: '',
  notifyWaToken: '',
  notifyWaTo: '',
  notifyEvents: 'reply,hot,bounce,error,daily,crm',
  dailyReportHour: 9,
  aiApiUrl: '',
  aiApiKey: '',
  aiModel: '',
  mcpToken: '',
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany()
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    workerEnabled: map.workerEnabled !== 'false',
    windowStart: clampHour(map.windowStart, 8),
    windowEnd: clampHour(map.windowEnd, 20),
    trackingUrl: map.trackingUrl || DEFAULTS.trackingUrl,
    signature: map.signature || DEFAULTS.signature,
    agentEnabled: map.agentEnabled !== 'false',
    agentAutonomy: parseAutonomy(map.agentAutonomy),
    dailyCapGlobal: clampInt(map.dailyCapGlobal, 1, 5000, DEFAULTS.dailyCapGlobal),
    notifyChannel: parseChannel(map.notifyChannel),
    notifyTelegramToken: map.notifyTelegramToken || '',
    notifyTelegramChat: map.notifyTelegramChat || '',
    notifyWaPhoneId: map.notifyWaPhoneId || '',
    notifyWaToken: map.notifyWaToken || '',
    notifyWaTo: map.notifyWaTo || '',
    notifyEvents: map.notifyEvents || DEFAULTS.notifyEvents,
    dailyReportHour: clampHour(map.dailyReportHour, DEFAULTS.dailyReportHour),
    aiApiUrl: map.aiApiUrl || '',
    aiApiKey: map.aiApiKey || '',
    aiModel: map.aiModel || '',
    mcpToken: map.mcpToken || '',
  }
}

function parseAutonomy(v: string | undefined): AppSettings['agentAutonomy'] {
  return v === 'OBSERVE' || v === 'ASSIST' || v === 'AUTO' ? v : 'AUTO'
}

function parseChannel(v: string | undefined): AppSettings['notifyChannel'] {
  return v === 'TELEGRAM' || v === 'WHATSAPP' || v === 'BOTH' || v === 'OFF' ? v : 'OFF'
}

function clampHour(v: string | undefined, fallback: number): number {
  return clampInt(v, 0, 23, fallback)
}

function clampInt(v: string | undefined, min: number, max: number, fallback: number): number {
  const n = parseInt(v || '', 10)
  if (isNaN(n) || n < min || n > max) return fallback
  return n
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const entries: [string, string][] = []
  const put = (k: keyof AppSettings, v: unknown) => entries.push([k, String(v)])
  if (patch.workerEnabled !== undefined) put('workerEnabled', patch.workerEnabled)
  if (patch.windowStart !== undefined) put('windowStart', patch.windowStart)
  if (patch.windowEnd !== undefined) put('windowEnd', patch.windowEnd)
  if (patch.trackingUrl !== undefined) put('trackingUrl', patch.trackingUrl)
  if (patch.signature !== undefined) put('signature', patch.signature)
  if (patch.agentEnabled !== undefined) put('agentEnabled', patch.agentEnabled)
  if (patch.agentAutonomy !== undefined) put('agentAutonomy', patch.agentAutonomy)
  if (patch.dailyCapGlobal !== undefined) put('dailyCapGlobal', patch.dailyCapGlobal)
  if (patch.notifyChannel !== undefined) put('notifyChannel', patch.notifyChannel)
  if (patch.notifyTelegramToken !== undefined) put('notifyTelegramToken', patch.notifyTelegramToken)
  if (patch.notifyTelegramChat !== undefined) put('notifyTelegramChat', patch.notifyTelegramChat)
  if (patch.notifyWaPhoneId !== undefined) put('notifyWaPhoneId', patch.notifyWaPhoneId)
  if (patch.notifyWaToken !== undefined) put('notifyWaToken', patch.notifyWaToken)
  if (patch.notifyWaTo !== undefined) put('notifyWaTo', patch.notifyWaTo)
  if (patch.notifyEvents !== undefined) put('notifyEvents', patch.notifyEvents)
  if (patch.dailyReportHour !== undefined) put('dailyReportHour', patch.dailyReportHour)
  if (patch.aiApiUrl !== undefined) put('aiApiUrl', patch.aiApiUrl)
  if (patch.aiApiKey !== undefined) put('aiApiKey', patch.aiApiKey)
  if (patch.aiModel !== undefined) put('aiModel', patch.aiModel)
  if (patch.mcpToken !== undefined) put('mcpToken', patch.mcpToken)
  for (const [key, value] of entries) {
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  }
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Garantiza que exista un token MCP (lo genera la primera vez) */
export async function ensureMcpToken(): Promise<string> {
  const s = await getSettings()
  if (s.mcpToken) return s.mcpToken
  const token = `amx_${crypto.randomUUID().replace(/-/g, '')}`
  await saveSettings({ mcpToken: token })
  return token
}

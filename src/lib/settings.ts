// Ajustes globales con valores por defecto.
// Los secretos (tokens, claves API) se guardan CIFRADOS con AES-256-GCM:
// · getSettings() los descifra (uso interno del servidor)
// · getPublicSettings() los enmascara (nunca salen por la API)
// · saveSettings() cifra cualquier secreto nuevo antes de guardarlo
import { db } from '@/lib/db'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

export interface AppSettings {
  workerEnabled: boolean
  windowStart: number // hora local inicio ventana de envío
  windowEnd: number // hora local fin ventana de envío
  appUrl: string // URL pública de la app (p.ej. https://app.alicelabs.space)
  trackingUrl: string // URL pública base para tracking y bajas (p.ej. https://mail.alicelabs.space)
  signature: string
  // ─── Asistente ───
  agentEnabled: boolean
  agentAutonomy: 'OBSERVE' | 'ASSIST' | 'AUTO'
  // ─── Cuota global diaria de campaña ───
  dailyCapGlobal: number
  // ─── Notificaciones ───
  notifyChannel: 'OFF' | 'TELEGRAM' | 'WHATSAPP' | 'BOTH'
  notifyTelegramToken: string // secreto
  notifyTelegramChat: string
  notifyWaPhoneId: string
  notifyWaToken: string // secreto
  notifyWaTo: string
  notifyEvents: string // csv: reply,hot,bounce,error,daily
  dailyReportHour: number
  // ─── Motor IA (endpoint OpenAI-compatible opcional, para la VM) ───
  aiApiUrl: string
  aiApiKey: string // secreto
  aiModel: string
  // ─── MCP ───
  mcpToken: string // secreto (token Bearer)
}

/** Campos que se almacenan cifrados */
export const SECRET_KEYS: (keyof AppSettings)[] = [
  'notifyTelegramToken',
  'notifyWaToken',
  'aiApiKey',
  'mcpToken',
]

const DEFAULTS = {
  workerEnabled: true,
  appUrl: 'https://app.alicelabs.space',
  trackingUrl: 'https://mail.alicelabs.space',
  signature: '',
  agentEnabled: true,
  agentAutonomy: 'AUTO' as const,
  dailyCapGlobal: 200,
  notifyChannel: 'OFF' as const,
  notifyEvents: 'reply,hot,bounce,error,daily,crm',
  dailyReportHour: 9,
  aiModel: '',
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany()
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    workerEnabled: map.workerEnabled !== 'false',
    windowStart: clampHour(map.windowStart, 8),
    windowEnd: clampHour(map.windowEnd, 20),
    appUrl: map.appUrl || DEFAULTS.appUrl,
    trackingUrl: map.trackingUrl || DEFAULTS.trackingUrl,
    signature: map.signature || DEFAULTS.signature,
    agentEnabled: map.agentEnabled !== 'false',
    agentAutonomy: parseAutonomy(map.agentAutonomy),
    dailyCapGlobal: clampInt(map.dailyCapGlobal, 1, 5000, DEFAULTS.dailyCapGlobal),
    notifyChannel: parseChannel(map.notifyChannel),
    notifyTelegramToken: decryptSecret(map.notifyTelegramToken),
    notifyTelegramChat: map.notifyTelegramChat || '',
    notifyWaPhoneId: map.notifyWaPhoneId || '',
    notifyWaToken: decryptSecret(map.notifyWaToken),
    notifyWaTo: map.notifyWaTo || '',
    notifyEvents: map.notifyEvents || DEFAULTS.notifyEvents,
    dailyReportHour: clampHour(map.dailyReportHour, DEFAULTS.dailyReportHour),
    aiApiUrl: map.aiApiUrl || '',
    aiApiKey: decryptSecret(map.aiApiKey),
    aiModel: map.aiModel || DEFAULTS.aiModel,
    mcpToken: decryptSecret(map.mcpToken),
  }
}

/** Versión para la API/UI: cero secretos, solo indicadores has* */
export async function getPublicSettings() {
  const s = await getSettings()
  return {
    workerEnabled: s.workerEnabled,
    windowStart: s.windowStart,
    windowEnd: s.windowEnd,
    appUrl: s.appUrl,
    trackingUrl: s.trackingUrl,
    signature: s.signature,
    agentEnabled: s.agentEnabled,
    agentAutonomy: s.agentAutonomy,
    dailyCapGlobal: s.dailyCapGlobal,
    notifyChannel: s.notifyChannel,
    hasTelegramToken: Boolean(s.notifyTelegramToken),
    notifyTelegramChat: s.notifyTelegramChat,
    notifyWaPhoneId: s.notifyWaPhoneId,
    hasWaToken: Boolean(s.notifyWaToken),
    notifyWaTo: s.notifyWaTo,
    notifyEvents: s.notifyEvents,
    dailyReportHour: s.dailyReportHour,
    aiApiUrl: s.aiApiUrl,
    hasAiApiKey: Boolean(s.aiApiKey),
    aiModel: s.aiModel,
    hasMcpToken: Boolean(s.mcpToken),
  }
}

export type PublicSettings = Awaited<ReturnType<typeof getPublicSettings>>

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
  if (patch.appUrl !== undefined) put('appUrl', patch.appUrl)
  if (patch.trackingUrl !== undefined) put('trackingUrl', patch.trackingUrl)
  if (patch.signature !== undefined) put('signature', patch.signature)
  if (patch.agentEnabled !== undefined) put('agentEnabled', patch.agentEnabled)
  if (patch.agentAutonomy !== undefined) put('agentAutonomy', patch.agentAutonomy)
  if (patch.dailyCapGlobal !== undefined) put('dailyCapGlobal', patch.dailyCapGlobal)
  if (patch.notifyChannel !== undefined) put('notifyChannel', patch.notifyChannel)
  // Secretos: solo se actualizan si llega un valor no vacío (vacío = conservar)
  if (patch.notifyTelegramToken) put('notifyTelegramToken', encryptSecret(patch.notifyTelegramToken))
  if (patch.notifyTelegramChat !== undefined) put('notifyTelegramChat', patch.notifyTelegramChat)
  if (patch.notifyWaPhoneId !== undefined) put('notifyWaPhoneId', patch.notifyWaPhoneId)
  if (patch.notifyWaToken) put('notifyWaToken', encryptSecret(patch.notifyWaToken))
  if (patch.notifyWaTo !== undefined) put('notifyWaTo', patch.notifyWaTo)
  if (patch.notifyEvents !== undefined) put('notifyEvents', patch.notifyEvents)
  if (patch.dailyReportHour !== undefined) put('dailyReportHour', patch.dailyReportHour)
  if (patch.aiApiUrl !== undefined) put('aiApiUrl', patch.aiApiUrl)
  if (patch.aiApiKey) put('aiApiKey', encryptSecret(patch.aiApiKey))
  if (patch.aiModel !== undefined) put('aiModel', patch.aiModel)
  if (patch.mcpToken) put('mcpToken', encryptSecret(patch.mcpToken))
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

/** Garantiza que exista un token MCP (lo genera cifrado la primera vez) */
export async function ensureMcpToken(): Promise<string> {
  const s = await getSettings()
  if (s.mcpToken) return s.mcpToken
  const token = `amx_${crypto.randomUUID().replace(/-/g, '')}`
  await saveSettings({ mcpToken: token })
  return token
}

// Tipos compartidos + helpers de fetch para la UI de AliceMail v2

export interface MailboxDTO {
  id: string
  email: string
  displayName: string
  provider: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
  verified: boolean
  status: string
  campaignDailyLimit: number
  warmupStart: number
  warmupMax: number
  warmupRamp: number
  sentWarmupToday: number
  sentCampaignToday: number
  lastError: string | null
  penaltyUntil: string | null
  warmupStartedAt: string
}

export interface LeadDTO {
  id: string
  email: string
  name: string | null
  company: string | null
  position: string | null
  status: string
  temperature: string
  aiNotes: string | null
  source: string
  lastContactedAt: string | null
  createdAt: string
  // ─── CRM v3 ───
  stage: string
  stageAt: string
  score: number
  openCount: number
  lastOpenedAt: string | null
  reengagedCount: number
  lastReengageAt: string | null
  currentAngle: string | null
  tags: string | null
}

export interface LeadEventDTO {
  id: string
  leadId: string
  type: string
  title: string
  detail: string | null
  createdAt: string
}

export interface LeadDetailDTO {
  lead: LeadDTO & {
    events: LeadEventDTO[]
    enrollments: { id: string; status: string; currentStep: number; campaign: { id: string; name: string; status: string } }[]
    sends: { id: string; subject: string; status: string; sentAt: string; kind: string }[]
  }
  replies: { id: string; subject: string; temperature: string | null; aiSummary: string | null; receivedAt: string }[]
}

export interface AngleDTO {
  id: string
  name: string
  description: string
  subject: string
  body: string
  active: boolean
  createdAt: string
}

export interface RuleDTO {
  id: string
  key: string
  name: string
  trigger: string
  threshold: number
  action: string
  promoCampaignId: string | null
  enabled: boolean
  lastRunAt: string | null
  firedCount: number
}

export const STAGE_ORDER: string[] = ['NUEVO', 'CONTACTADO', 'CALIENTE', 'TIBIO', 'FRIO', 'RECHAZADO', 'RECUPERADO']

export const STAGE_LABEL_V3: Record<string, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'En contacto',
  CALIENTE: 'Caliente',
  TIBIO: 'Tibio',
  FRIO: 'Frío',
  RECHAZADO: 'Rechazado',
  RECUPERADO: 'Recuperado',
}

export const STAGE_BADGE: Record<string, string> = {
  NUEVO: 'bg-slate-100 text-slate-700 border-slate-200',
  CONTACTADO: 'bg-violet-100 text-violet-700 border-violet-200',
  CALIENTE: 'bg-rose-100 text-rose-700 border-rose-200',
  TIBIO: 'bg-amber-100 text-amber-800 border-amber-200',
  FRIO: 'bg-sky-100 text-sky-800 border-sky-200',
  RECHAZADO: 'bg-zinc-200 text-zinc-600 border-zinc-300',
  RECUPERADO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

export const STAGE_DOT: Record<string, string> = {
  NUEVO: 'bg-slate-400',
  CONTACTADO: 'bg-violet-500',
  CALIENTE: 'bg-rose-500',
  TIBIO: 'bg-amber-500',
  FRIO: 'bg-sky-500',
  RECHAZADO: 'bg-zinc-500',
  RECUPERADO: 'bg-emerald-500',
}

export const RULE_ACTION_LABEL: Record<string, string> = {
  RESEND: 'Re-enviar último correo',
  CHANGE_ANGLE: 'Cambiar de enfoque',
  NEW_PROMO: 'Meter en otra promoción',
}

export const RULE_TRIGGER_LABEL: Record<string, string> = {
  OPENS_NO_REPLY: 'Abre N veces sin responder',
  COLD_DAYS: 'Lleva N días frío',
  NO_OPEN: 'No abre en N días',
}

export const RULE_ACTION_ICON: Record<string, string> = {
  RESEND: '🔁',
  CHANGE_ANGLE: '🧭',
  NEW_PROMO: '🎯',
}

export interface CampaignDTO {
  id: string
  name: string
  fromName: string
  status: string
  dailyTarget: number
  trackOpens: boolean
  createdAt: string
  stepCount: number
  enrollmentCount: number
  sent: number
  replied: number
}

export interface QuotaDTO {
  campaignCap: number
  campaignSentToday: number
  campaignRemaining: number
  warmupToday: number
  totalToday: number
  byMailbox: {
    id: string
    email: string
    displayName: string
    campaignLimit: number
    campaignSent: number
    campaignRemaining: number
    warmupSent: number
    warmupTarget: number
  }[]
}

export interface StatsDTO {
  kpis: {
    sentToday: number
    warmupToday: number
    openedToday: number
    openRate: number
    repliedTotal: number
    bouncesTotal: number
    mailboxesByStatus: Record<string, number>
  }
  series: { label: string; warmup: number; campaign: number; failed: number }[]
  leadStatus: Record<string, number>
  temperatures: Record<string, number>
  stages: Record<string, number>
  crm: { reengagedToday: number; rulesEnabled: number }
  quota: QuotaDTO
  recent: { id: string; kind: string; status: string; to: string; subject: string; from: string; at: string }[]
  warmupProgress: {
    id: string
    email: string
    displayName: string
    status: string
    verified: boolean
    warmupToday: number
    campaignToday: number
    target: number
    max: number
    campaignLimit: number
    lastError: string | null
    penalty: boolean
  }[]
}

export interface InboxMessageDTO {
  id: string
  from: string
  subject: string
  body: string
  isReply: boolean
  isBounce: boolean
  read: boolean
  receivedAt: string
  mailbox: string
  temperature: string | null
  aiIntent: string | null
  aiSummary: string | null
  aiReply: string | null
  classified: boolean
  repliedAt: string | null
}

export interface InboxDTO {
  unreadCount: number
  unclassifiedCount: number
  messages: InboxMessageDTO[]
}

export interface SettingsDTO {
  workerEnabled: boolean
  windowStart: number
  windowEnd: number
  trackingUrl: string
  signature: string
  dailyCapGlobal: number
  agentEnabled: boolean
  agentAutonomy: string
  notifyChannel: string
  notifyTelegramToken: string
  notifyTelegramChat: string
  notifyWaPhoneId: string
  notifyWaToken: string
  notifyWaTo: string
  notifyEvents: string
  dailyReportHour: number
  aiApiUrl: string
  aiApiKey: string
  aiModel: string
  mcpToken: string
}

export interface AgentEventDTO {
  id: string
  type: string
  level: string
  message: string
  meta: string | null
  createdAt: string
}

export interface AgentDTO {
  settings: {
    agentEnabled: boolean
    agentAutonomy: string
    dailyReportHour: number
    aiApiUrl: string
    aiApiKey: string
    aiModel: string
  }
  stats: {
    pending: number
    drafts: number
    hotLeads: number
    warmLeads: number
    classifiedToday: number
    actionsToday: number
    lastEvent: string | null
    lastEventAt: string | null
  }
}

export interface NotificationDTO {
  id: string
  channel: string
  event: string
  title: string
  body: string
  status: string
  error: string | null
  createdAt: string
}

export interface McpToolDTO {
  name: string
  description: string
}

export interface McpDTO {
  server: string
  version: string
  protocol: string
  endpoint: string
  token: string
  tools: McpToolDTO[]
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Error ${res.status}`)
  return data as T
}

export const LEAD_STATUS_LABEL: Record<string, string> = {
  NEW: 'Nuevo',
  ACTIVE: 'En campaña',
  REPLIED: 'Respondió',
  BOUNCED: 'Rebotó',
  UNSUBSCRIBED: 'Dado de baja',
  PAUSED: 'Pausado',
}

export const LEAD_STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  REPLIED: 'bg-teal-100 text-teal-800',
  BOUNCED: 'bg-amber-100 text-amber-800',
  UNSUBSCRIBED: 'bg-zinc-200 text-zinc-600',
  PAUSED: 'bg-orange-100 text-orange-700',
}

export const MB_STATUS_LABEL: Record<string, string> = {
  WARMUP: 'Calentando',
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  ERROR: 'Error',
}

export const MB_STATUS_COLOR: Record<string, string> = {
  WARMUP: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PAUSED: 'bg-slate-100 text-slate-600',
  ERROR: 'bg-red-100 text-red-700',
}

export const TEMP_LABEL: Record<string, string> = {
  HOT: 'Caliente',
  WARM: 'Tibio',
  COLD: 'Frío',
  OOO: 'Fuera de oficina',
}

export const TEMP_BADGE: Record<string, string> = {
  HOT: 'bg-rose-100 text-rose-700',
  WARM: 'bg-amber-100 text-amber-800',
  COLD: 'bg-sky-100 text-sky-800',
  OOO: 'bg-slate-100 text-slate-600',
}

export const EVENT_LEVEL_STYLE: Record<string, { badge: string; icon: string }> = {
  INFO: { badge: 'bg-slate-100 text-slate-600', icon: 'text-slate-400' },
  ACTION: { badge: 'bg-teal-100 text-teal-800', icon: 'text-teal-600' },
  SUCCESS: { badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-600' },
  WARN: { badge: 'bg-amber-100 text-amber-800', icon: 'text-amber-600' },
  ERROR: { badge: 'bg-red-100 text-red-700', icon: 'text-red-600' },
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  CLASSIFY: 'Clasifica',
  ACTION: 'Acción',
  GUARD: 'Guardián',
  REPORT: 'Informe',
  NOTIFY: 'Notifica',
  SYSTEM: 'Sistema',
  CRM: 'CRM',
}

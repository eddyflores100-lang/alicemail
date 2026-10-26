// ─────────────────────────────────────────────────────────────────────
// AliceMail — Cuota de envíos del día (por buzón y global)
// ─────────────────────────────────────────────────────────────────────
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'

export interface QuotaSummary {
  campaignCap: number // tope efectivo hoy (global vs suma de buzones)
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

export async function getQuotaSummary(): Promise<QuotaSummary> {
  const s = await getSettings()
  const mbs = await db.mailbox.findMany({
    where: { verified: true, status: { in: ['WARMUP', 'ACTIVE'] } },
  })
  const sumCaps = mbs.reduce((a, m) => a + m.campaignDailyLimit, 0)
  const campaignCap = Math.min(s.dailyCapGlobal, sumCaps || s.dailyCapGlobal)
  const campaignSentToday = await db.send.count({
    where: { kind: 'CAMPAIGN', status: 'SENT', sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
  })
  const warmupToday = await db.send.count({
    where: { kind: 'WARMUP', status: 'SENT', sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
  })
  return {
    campaignCap,
    campaignSentToday,
    campaignRemaining: Math.max(0, campaignCap - campaignSentToday),
    warmupToday,
    totalToday: campaignSentToday + warmupToday,
    byMailbox: mbs.map((m) => ({
      id: m.id,
      email: m.email,
      displayName: m.displayName,
      campaignLimit: m.campaignDailyLimit,
      campaignSent: m.sentCampaignToday,
      campaignRemaining: Math.max(0, m.campaignDailyLimit - m.sentCampaignToday),
      warmupSent: m.sentWarmupToday,
      warmupTarget: Math.min(m.warmupMax, m.warmupStart + m.warmupRamp * Math.floor((Date.now() - new Date(m.warmupStartedAt).getTime()) / 86_400_000)),
    })),
  }
}

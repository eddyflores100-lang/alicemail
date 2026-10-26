import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { todayKey } from '@/lib/settings'
import { getQuotaSummary } from '@/lib/quota'
import { STAGES } from '@/lib/crm'

export async function GET() {
  const today = startOfToday()
  const now = new Date()

  // KPIs de hoy
  const [sentToday, openedToday, repliedTotal, bouncesTotal, mailboxStats] = await Promise.all([
    db.send.count({ where: { kind: 'CAMPAIGN', sentAt: { gte: today } } }),
    db.send.count({ where: { kind: 'CAMPAIGN', openedAt: { not: null }, sentAt: { gte: today } } }),
    db.enrollment.count({ where: { status: 'REPLIED' } }),
    db.send.count({ where: { kind: 'CAMPAIGN', status: 'BOUNCED' } }),
    db.mailbox.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const [warmupToday] = await Promise.all([
    db.send.count({ where: { kind: 'WARMUP', sentAt: { gte: today } } }),
  ])

  // serie de 14 días (warmup vs campaña)
  const since = new Date(today.getTime() - 13 * 86_400_000)
  const sends = await db.send.findMany({
    where: { sentAt: { gte: since } },
    select: { kind: true, sentAt: true, status: true },
  })
  const days: { date: string; label: string; warmup: number; campaign: number; failed: number }[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() + i * 86_400_000 - 13 * 86_400_000)
    const key = todayKey(d)
    days.push({
      date: key,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      warmup: 0,
      campaign: 0,
      failed: 0,
    })
  }
  const byKey = Object.fromEntries(days.map((d) => [d.date, d]))
  for (const s of sends) {
    const k = todayKey(new Date(s.sentAt))
    const row = byKey[k]
    if (!row) continue
    if (s.status === 'FAILED') row.failed++
    else if (s.kind === 'WARMUP') row.warmup++
    else row.campaign++
  }

  // leads por estado y por temperatura (agente IA)
  const [leadStatus, leadTemps, leadStages, reengagedToday, rulesOn, quota] = await Promise.all([
    db.lead.groupBy({ by: ['status'], _count: { _all: true } }),
    db.lead.groupBy({ by: ['temperature'], _count: { _all: true } }),
    db.lead.groupBy({ by: ['stage'], _count: { _all: true } }),
    db.leadEvent.count({ where: { type: { in: ['REENGAGE', 'ANGLE', 'PROMO'] }, createdAt: { gte: today } } }),
    db.reEngageRule.count({ where: { enabled: true } }),
    getQuotaSummary(),
  ])
  const stageCounts: Record<string, number> = {}
  for (const st of STAGES) stageCounts[st] = 0
  for (const g of leadStages) stageCounts[g.stage] = g._count._all

  // aperturas totales (tasa sobre campañas)
  const [campaignTotal, opensTotal] = await Promise.all([
    db.send.count({ where: { kind: 'CAMPAIGN', status: 'SENT' } }),
    db.send.count({ where: { kind: 'CAMPAIGN', openedAt: { not: null } } }),
  ])

  // actividad reciente
  const recent = await db.send.findMany({
    orderBy: { sentAt: 'desc' },
    take: 12,
    include: { mailbox: { select: { email: true } } },
  })

  // progreso warmup por buzón
  const mailboxes = await db.mailbox.findMany({ orderBy: { createdAt: 'asc' } })
  const warmupProgress = mailboxes.map((mb) => {
    const days = Math.floor((now.getTime() - new Date(mb.warmupStartedAt).getTime()) / 86_400_000)
    const target = Math.min(mb.warmupStart + mb.warmupRamp * days, mb.warmupMax)
    return {
      id: mb.id,
      email: mb.email,
      displayName: mb.displayName,
      status: mb.status,
      verified: mb.verified,
      warmupToday: mb.sentWarmupToday,
      campaignToday: mb.sentCampaignToday,
      target,
      max: mb.warmupMax,
      campaignLimit: mb.campaignDailyLimit,
      lastError: mb.lastError,
      penalty: mb.penaltyUntil ? new Date(mb.penaltyUntil) > now : false,
    }
  })

  return NextResponse.json({
    kpis: {
      sentToday,
      warmupToday,
      openedToday,
      openRate: campaignTotal > 0 ? Math.round((opensTotal / campaignTotal) * 1000) / 10 : 0,
      repliedTotal,
      bouncesTotal,
      mailboxesByStatus: Object.fromEntries(mailboxStats.map((m) => [m.status, m._count._all])),
    },
    series: days,
    leadStatus: Object.fromEntries(leadStatus.map((l) => [l.status, l._count._all])),
    temperatures: Object.fromEntries(leadTemps.map((l) => [l.temperature, l._count._all])),
    stages: stageCounts,
    crm: { reengagedToday, rulesEnabled: rulesOn },
    quota: {
      campaignCap: quota.campaignCap,
      campaignSentToday: quota.campaignSentToday,
      campaignRemaining: quota.campaignRemaining,
      warmupToday: quota.warmupToday,
      totalToday: quota.totalToday,
      byMailbox: quota.byMailbox,
    },
    recent: recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      to: r.toEmail,
      subject: r.subject,
      from: r.mailbox.email,
      at: r.sentAt,
    })),
    warmupProgress,
    worker: { lastInfo: '' },
  })
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettings, saveSettings } from '@/lib/settings'

export async function GET() {
  const s = await getSettings()
  const [pending, drafts, hotLeads, warmLeads, lastCycle] = await Promise.all([
    db.inboxMessage.count({ where: { isReply: true, classified: false, isBounce: false } }),
    db.inboxMessage.count({ where: { isReply: true, classified: true, repliedAt: null, isBounce: false, aiReply: { not: null } } }),
    db.lead.count({ where: { temperature: 'HOT' } }),
    db.lead.count({ where: { temperature: 'WARM' } }),
    db.agentEvent.findFirst({ orderBy: { createdAt: 'desc' } }),
  ])
  const today = new Date(new Date().setHours(0, 0, 0, 0))
  const [classifiedToday, actionsToday] = await Promise.all([
    db.agentEvent.count({ where: { type: 'CLASSIFY', createdAt: { gte: today } } }),
    db.agentEvent.count({ where: { type: 'ACTION', createdAt: { gte: today } } }),
  ])
  return NextResponse.json({
    settings: {
      agentEnabled: s.agentEnabled,
      agentAutonomy: s.agentAutonomy,
      dailyReportHour: s.dailyReportHour,
      aiApiUrl: s.aiApiUrl,
      aiApiKey: s.aiApiKey,
      aiModel: s.aiModel,
    },
    stats: { pending, drafts, hotLeads, warmLeads, classifiedToday, actionsToday, lastEvent: lastCycle?.message || null, lastEventAt: lastCycle?.createdAt || null },
  })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  await saveSettings({
    agentEnabled: body.agentEnabled,
    agentAutonomy: body.agentAutonomy,
    dailyReportHour: body.dailyReportHour !== undefined ? Number(body.dailyReportHour) : undefined,
    aiApiUrl: body.aiApiUrl,
    aiApiKey: body.aiApiKey,
    aiModel: body.aiModel,
  })
  return NextResponse.json({ ok: true })
}

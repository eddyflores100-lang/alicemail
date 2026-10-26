import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/lib/settings'

export async function GET() {
  const settings = await getSettings()
  return NextResponse.json(settings)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  await saveSettings({
    workerEnabled: body.workerEnabled,
    windowStart: body.windowStart !== undefined ? Number(body.windowStart) : undefined,
    windowEnd: body.windowEnd !== undefined ? Number(body.windowEnd) : undefined,
    trackingUrl: body.trackingUrl,
    signature: body.signature,
    dailyCapGlobal: body.dailyCapGlobal !== undefined ? Number(body.dailyCapGlobal) : undefined,
    agentEnabled: body.agentEnabled,
    agentAutonomy: body.agentAutonomy,
    notifyChannel: body.notifyChannel,
    notifyTelegramToken: body.notifyTelegramToken,
    notifyTelegramChat: body.notifyTelegramChat,
    notifyWaPhoneId: body.notifyWaPhoneId,
    notifyWaToken: body.notifyWaToken,
    notifyWaTo: body.notifyWaTo,
    notifyEvents: body.notifyEvents,
    dailyReportHour: body.dailyReportHour !== undefined ? Number(body.dailyReportHour) : undefined,
    aiApiUrl: body.aiApiUrl,
    aiApiKey: body.aiApiKey,
    aiModel: body.aiModel,
  })
  return NextResponse.json(await getSettings())
}

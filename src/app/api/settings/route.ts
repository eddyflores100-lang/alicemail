import { NextRequest, NextResponse } from 'next/server'
import { getPublicSettings, saveSettings } from '@/lib/settings'
import { isAuthenticated } from '@/lib/auth'

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  return NextResponse.json(await getPublicSettings())
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const body = await req.json()
  await saveSettings({
    workerEnabled: body.workerEnabled,
    windowStart: body.windowStart !== undefined ? Number(body.windowStart) : undefined,
    windowEnd: body.windowEnd !== undefined ? Number(body.windowEnd) : undefined,
    appUrl: body.appUrl,
    trackingUrl: body.trackingUrl,
    signature: body.signature,
    dailyCapGlobal: body.dailyCapGlobal !== undefined ? Number(body.dailyCapGlobal) : undefined,
    agentEnabled: body.agentEnabled,
    agentAutonomy: body.agentAutonomy,
    notifyChannel: body.notifyChannel,
    // Secretos: solo se guardan si llega un valor no vacío (vacío = conservar)
    notifyTelegramToken: body.notifyTelegramToken || undefined,
    notifyTelegramChat: body.notifyTelegramChat,
    notifyWaPhoneId: body.notifyWaPhoneId,
    notifyWaToken: body.notifyWaToken || undefined,
    notifyWaTo: body.notifyWaTo,
    notifyEvents: body.notifyEvents,
    dailyReportHour: body.dailyReportHour !== undefined ? Number(body.dailyReportHour) : undefined,
    aiApiUrl: body.aiApiUrl,
    aiApiKey: body.aiApiKey || undefined,
    aiModel: body.aiModel,
  })
  return NextResponse.json(await getPublicSettings())
}

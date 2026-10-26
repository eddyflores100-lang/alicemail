import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordOpen } from '@/lib/crm'

const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', // GIF 1x1
  'base64'
)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ data: string }> }) {
  const { data } = await params
  try {
    const decoded = Buffer.from(data, 'base64url').toString('utf8')
    const [campaignId, leadId, stepStr] = decoded.split('.')
    const stepNumber = parseInt(stepStr || '0', 10) || 0
    if (campaignId && leadId) {
      // registra apertura en el envío más reciente que coincida (solo la primera vez)
      const send = await db.send.findFirst({
        where: { campaignId, leadId, stepNumber, openedAt: null },
        orderBy: { sentAt: 'desc' },
      })
      if (send) {
        await db.send.update({ where: { id: send.id }, data: { openedAt: new Date() } })
        // CRM: cuenta la apertura, suma score y apunta en el timeline del lead
        await recordOpen(leadId, stepNumber)
      }
    }
  } catch {
    /* píxel silencioso: nunca rompemos la respuesta */
  }
  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

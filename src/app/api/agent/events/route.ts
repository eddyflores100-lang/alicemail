import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '60', 10) || 60))
  const events = await db.agentEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
  return NextResponse.json({ events })
}

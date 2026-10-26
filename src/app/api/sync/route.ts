import { NextRequest, NextResponse } from 'next/server'
import { getSyncStatus, runSyncNow, buildSnapshot } from '@/lib/githubSync'

export async function GET() {
  const status = getSyncStatus()
  return NextResponse.json({ status })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (body.action === 'snapshot') {
    try {
      return NextResponse.json({ ok: true, snapshot: await buildSnapshot() })
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
    }
  }
  const r = await runSyncNow()
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}

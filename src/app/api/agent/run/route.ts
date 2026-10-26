import { NextResponse } from 'next/server'
import { agentCycle } from '@/lib/agent'

export async function POST() {
  const r = await agentCycle(true)
  return NextResponse.json({ ok: true, ...r })
}

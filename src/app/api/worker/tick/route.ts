import { NextResponse } from 'next/server'
import { tick } from '@/lib/worker'

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST para forzar un ciclo de envío ahora' })
}

export async function POST() {
  const result = await tick()
  return NextResponse.json(result)
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHash, randomUUID } from 'crypto'

function makeToken(email: string): string {
  return createHash('sha256').update(email + randomUUID()).digest('hex').slice(0, 24)
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function parseLine(line: string): { email: string; name: string; company: string; position: string } | null {
  const parts = line.split(/[;,\t]/).map((s) => s.trim().replace(/^"|"$/g, ''))
  const emailIdx = parts.findIndex((p) => EMAIL_RE.test(p))
  if (emailIdx === -1) return null
  const others = parts.filter((_, i) => i !== emailIdx)
  const nonEmpty = others.filter(Boolean)
  return {
    email: parts[emailIdx].toLowerCase(),
    name: nonEmpty[0] || '',
    company: nonEmpty[1] || '',
    position: nonEmpty[2] || '',
  }
}

export async function POST(req: NextRequest) {
  const { csv } = await req.json()
  if (!csv || typeof csv !== 'string') {
    return NextResponse.json({ error: 'Falta el contenido CSV' }, { status: 400 })
  }
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return NextResponse.json({ error: 'CSV vacío' }, { status: 400 })

  const hasHeader = !EMAIL_RE.test(lines[0].split(/[;,\t]/)[0])
  const rows = lines
    .slice(hasHeader ? 1 : 0)
    .map((l) => parseLine(l))
    .filter((r): r is NonNullable<typeof r> => r !== null)

  let created = 0
  let duplicated = 0
  const seen = new Set<string>()

  for (const r of rows) {
    if (seen.has(r.email)) {
      duplicated++
      continue
    }
    seen.add(r.email)
    try {
      await db.lead.create({
        data: {
          email: r.email,
          name: r.name || null,
          company: r.company || null,
          position: r.position || null,
          source: 'csv',
          unsubToken: makeToken(r.email),
        },
      })
      created++
    } catch {
      duplicated++
    }
  }
  return NextResponse.json({ created, duplicated, rejected: lines.length - (hasHeader ? 1 : 0) - rows.length })
}

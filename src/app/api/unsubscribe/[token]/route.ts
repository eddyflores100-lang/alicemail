import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function page(title: string, message: string, ok = true): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px;max-width:420px;text-align:center}
h1{font-size:20px;color:#0f172a;margin:0 0 10px}p{color:#64748b;font-size:14px;line-height:1.6;margin:0}
.badge{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px}
.ok{background:#dcfce7}.bad{background:#fee2e2}</style></head>
<body><div class="card"><div class="badge ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✕'}</div><h1>${title}</h1><p>${message}</p></div></body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const confirm = new URL(req.url).searchParams.get('confirm')
  const lead = await db.lead.findUnique({ where: { unsubToken: token } })
  if (!lead) {
    return page('Enlace no válido', 'Este enlace de baja no es válido o ya fue desactivado.', false)
  }
  if (!confirm) {
    return page(
      'Confirmar baja',
      `Vas a dejar de recibir correos de nuestra parte en <strong>${lead.email}</strong>.<br/><br/><a href="?confirm=1" style="display:inline-block;margin-top:12px;background:#0f172a;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none">Confirmar baja</a>`
    )
  }
  await db.lead.update({ where: { id: lead.id }, data: { status: 'UNSUBSCRIBED' } })
  await db.enrollment.updateMany({
    where: { leadId: lead.id, status: { in: ['QUEUED', 'IN_PROGRESS'] } },
    data: { status: 'FINISHED' },
  })
  // CRM: catalogar como rechazado en el pipeline
  const { setLeadStage, logLeadEvent } = await import('@/lib/crm')
  await logLeadEvent(lead.id, 'STAGE', 'Se dio de baja desde el enlace del correo')
  await setLeadStage(lead, 'RECHAZADO', { source: 'baja por unsubscribe', silent: true })
  return page('Baja confirmada', 'Has sido eliminado de nuestra lista. No recibirás más correos.')
}

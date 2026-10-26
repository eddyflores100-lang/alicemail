// Middleware de seguridad: protege todas las rutas API con la cookie de
// sesión firmada. Las rutas públicas (pixel, bajas, auth y MCP con su
// propio Bearer) quedan excluidas explícitamente.
import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, SESSION_COOKIE, PUBLIC_API_PATHS } from '@/lib/session'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (!pathname.startsWith('/api/')) return NextResponse.next()
  if (PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (await verifySessionToken(token)) return NextResponse.next()

  return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
}

export const config = {
  matcher: ['/api/:path*'],
}

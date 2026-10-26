import { NextResponse } from 'next/server'
import { hasPassword, isAuthenticated } from '@/lib/auth'

export async function GET() {
  return NextResponse.json({ authenticated: await isAuthenticated(), hasPassword: await hasPassword() })
}
